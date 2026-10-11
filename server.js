const crypto=require("crypto");
const express=require("express");
const path=require("path");
const mysql=require("mysql2/promise");
const {Resend}=require("resend");

const app=express();
const PORT=process.env.PORT||3000;
const PUBLIC_URL=(process.env.PUBLIC_URL||"https://lebronjames.io.vn").replace(/\/$/,"");
const RESEND_API_KEY=process.env.RESEND_API_KEY;
const MAGIC_LINK_FROM=process.env.MAGIC_LINK_FROM||"onboarding@resend.dev";
const COOKIE_SECURE=process.env.COOKIE_SECURE!=="false";
const MAGIC_LINK_TTL_MINUTES=Number(process.env.MAGIC_LINK_TTL_MINUTES||15);
const SESSION_TTL_DAYS=Number(process.env.SESSION_TTL_DAYS||30);
const resend=RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const appRoot=__dirname;

const pool=mysql.createPool({
    host:process.env.DB_HOST||"localhost",
    port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER||"app_user",
    password:process.env.DB_PASSWORD||"app_password",
    database:process.env.DB_NAME||"hello_world",
    waitForConnections:true,
    connectionLimit:10,
    queueLimit:0
});

app.use(express.json());

function normalizeEmail(email){
    return String(email||"").trim().toLowerCase();
}

function isValidEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomToken(length){
    const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let token="";

    while (token.length<length) {
        const bytes=crypto.randomBytes(length);
        for (const byte of bytes) {
            if (token.length>=length) {
                break;
            }
            token+=alphabet[byte%alphabet.length];
        }
    }

    return token;
}

function randomOtp(){
    return String(crypto.randomInt(0,1000000)).padStart(6,"0");
}

function sha256(value){
    return crypto.createHash("sha256").update(value).digest("hex");
}

function parseCookies(header){
    return String(header||"")
        .split(";")
        .map((part)=>part.trim())
        .filter(Boolean)
        .reduce((cookies,part)=>{
            const index=part.indexOf("=");
            if (index===-1) {
                return cookies;
            }

            const name=decodeURIComponent(part.slice(0,index));
            const value=decodeURIComponent(part.slice(index+1));
            cookies[name]=value;
            return cookies;
        },{});
}

function maskEmail(email){
    const [name,domain]=String(email||"").split("@");

    if (!name||!domain) {
        return email;
    }

    return `${name.slice(0,2)}***@${domain}`;
}

function sanitizeDebugRow(row){
    return Object.fromEntries(
        Object.entries(row).map(([key,value])=>{
            if (key==="email") {
                return [key,maskEmail(value)];
            }

            if (["code_hash","otp_hash","request_token_hash","session_hash","error_message"].includes(key)) {
                return [key,value ? "[hidden]" : value];
            }

            return [key,value];
        })
    );
}

async function ensureColumn(table,column,definition){
    const [rows]=await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
        [table,column]
    );

    if (rows.length===0) {
        await pool.query(`ALTER TABLE ?? ADD COLUMN ${definition}`,[table]);
    }
}

async function ensureIndex(table,indexName,columns){
    const [rows]=await pool.query(
        `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1`,
        [table,indexName]
    );

    if (rows.length===0) {
        await pool.query(`ALTER TABLE ?? ADD INDEX ${indexName} (${columns})`,[table]);
    }
}

async function ensureTables(){
    await pool.query(`
        CREATE TABLE IF NOT EXISTS random_numbers (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            value INT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS magic_link_requests (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            code_hash CHAR(64) NULL,
            otp_hash CHAR(64) NULL,
            request_token_hash CHAR(64) NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at TIMESTAMP NULL DEFAULT NULL,
            expires_at TIMESTAMP NULL DEFAULT NULL,
            used_at TIMESTAMP NULL DEFAULT NULL,
            error_message TEXT NULL,
            INDEX idx_magic_link_requests_email (email),
            INDEX idx_magic_link_requests_status (status),
            INDEX idx_magic_link_requests_code_hash (code_hash),
            INDEX idx_magic_link_requests_request_token_hash (request_token_hash)
        )
    `);

    await ensureColumn("magic_link_requests","code_hash","code_hash CHAR(64) NULL");
    await ensureColumn("magic_link_requests","otp_hash","otp_hash CHAR(64) NULL");
    await ensureColumn("magic_link_requests","request_token_hash","request_token_hash CHAR(64) NULL");
    await ensureColumn("magic_link_requests","expires_at","expires_at TIMESTAMP NULL DEFAULT NULL");
    await ensureColumn("magic_link_requests","used_at","used_at TIMESTAMP NULL DEFAULT NULL");
    await ensureColumn("magic_link_requests","error_message","error_message TEXT NULL");
    await ensureIndex("magic_link_requests","idx_magic_link_requests_code_hash","code_hash");
    await ensureIndex("magic_link_requests","idx_magic_link_requests_request_token_hash","request_token_hash");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS magic_link_sessions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            request_id BIGINT UNSIGNED NOT NULL,
            session_hash CHAR(64) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            INDEX idx_magic_link_sessions_email (email),
            INDEX idx_magic_link_sessions_session_hash (session_hash),
            CONSTRAINT fk_magic_link_sessions_request
                FOREIGN KEY (request_id) REFERENCES magic_link_requests(id)
                ON DELETE CASCADE
        )
    `);
}

async function getCurrentSession(req){
    const cookies=parseCookies(req.headers.cookie);
    const sessionToken=cookies.lj_session;

    if (!sessionToken) {
        return null;
    }

    const [rows]=await pool.query(
        `SELECT email,created_at,expires_at
         FROM magic_link_sessions
         WHERE session_hash=? AND expires_at>NOW()
         ORDER BY id DESC
         LIMIT 1`,
        [sha256(sessionToken)]
    );

    return rows[0]||null;
}

async function createSession(connection,request){
    const sessionToken=randomToken(48);
    const sessionExpiresAt=new Date(Date.now()+SESSION_TTL_DAYS*24*60*60*1000);

    await connection.query(
        `INSERT INTO magic_link_sessions (email,request_id,session_hash,expires_at)
         VALUES (?,?,?,?)`,
        [request.email,request.id,sha256(sessionToken),sessionExpiresAt]
    );
    await connection.query(
        "UPDATE magic_link_requests SET status='used',used_at=NOW() WHERE id=?",
        [request.id]
    );

    return sessionToken;
}

function setSessionCookie(res,sessionToken){
    res.cookie("lj_session",sessionToken,{
        httpOnly:true,
        secure:COOKIE_SECURE,
        sameSite:"lax",
        maxAge:SESSION_TTL_DAYS*24*60*60*1000,
        path:"/"
    });
}

app.post("/api/auth/magic-link",async (req,res,next)=>{
    try {
        const email=normalizeEmail(req.body.email);

        if (!isValidEmail(email)) {
            return res.status(400).json({error:"Email không hợp lệ"});
        }

        if (!resend) {
            return res.status(500).json({error:"Server chưa cấu hình RESEND_API_KEY"});
        }

        const code=randomToken(30);
        const otp=randomOtp();
        const requestToken=randomToken(48);
        const link=`${PUBLIC_URL}/login/${code}`;
        const expiresAt=new Date(Date.now()+MAGIC_LINK_TTL_MINUTES*60*1000);
        const [result]=await pool.query(
            `INSERT INTO magic_link_requests (email,code_hash,otp_hash,request_token_hash,status,expires_at)
             VALUES (?,?,?,?,'pending',?)`,
            [email,sha256(code),sha256(otp),sha256(requestToken),expiresAt]
        );

        try {
            await resend.emails.send({
                from:MAGIC_LINK_FROM,
                to:email,
                subject:"Đăng nhập Lebron site",
                html:`
                    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#18002e;color:#fff7d6;border-radius:18px;">
                        <h1 style="margin:0 0 16px;color:#fdb927;">Đăng nhập Lebron site</h1>
                        <p>Bấm link bên dưới để đăng nhập:</p>
                        <p><a href="${link}" style="color:#ffdf6e;font-weight:700;">${link}</a></p>
                        <p>Hoặc nhập mã 6 số này trên đúng máy vừa yêu cầu email:</p>
                        <div style="margin:22px 0;padding:18px 22px;text-align:center;background:#2d0b4d;border:2px solid #fdb927;border-radius:16px;color:#ffdf6e;font-size:42px;font-weight:900;letter-spacing:0.22em;line-height:1;">
                            ${otp}
                        </div>
                        <p style="color:#f7e9bd;">Link và mã hết hạn sau ${MAGIC_LINK_TTL_MINUTES} phút.</p>
                    </div>
                `
            });

            await pool.query(
                "UPDATE magic_link_requests SET status='sent',sent_at=NOW() WHERE id=?",
                [result.insertId]
            );
        } catch (error) {
            await pool.query(
                "UPDATE magic_link_requests SET status='failed',error_message=? WHERE id=?",
                [error.message,result.insertId]
            );
            throw error;
        }

        const [rows]=await pool.query(
            "SELECT id,email,status,created_at,sent_at,expires_at FROM magic_link_requests WHERE id=?",
            [result.insertId]
        );

        res.cookie("lj_login_request",requestToken,{
            httpOnly:true,
            secure:COOKIE_SECURE,
            sameSite:"lax",
            maxAge:MAGIC_LINK_TTL_MINUTES*60*1000,
            path:"/"
        });
        res.status(201).json(rows[0]);
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/verify-code",async (req,res,next)=>{
    try {
        const otp=String(req.body.code||"").trim();
        const cookies=parseCookies(req.headers.cookie);
        const requestToken=cookies.lj_login_request;

        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({error:"Mã phải gồm 6 số"});
        }

        if (!requestToken) {
            return res.status(400).json({error:"Máy này không có yêu cầu đăng nhập đang chờ"});
        }

        const connection=await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [requests]=await connection.query(
                `SELECT id,email,expires_at,used_at
                 FROM magic_link_requests
                 WHERE request_token_hash=? AND otp_hash=?
                 ORDER BY id DESC
                 LIMIT 1
                 FOR UPDATE`,
                [sha256(requestToken),sha256(otp)]
            );
            const request=requests[0];

            if (!request) {
                await connection.rollback();
                return res.status(400).json({error:"Mã không đúng"});
            }

            if (request.used_at) {
                await connection.rollback();
                return res.status(400).json({error:"Mã đã được sử dụng"});
            }

            if (new Date(request.expires_at).getTime()<Date.now()) {
                await connection.query(
                    "UPDATE magic_link_requests SET status='expired' WHERE id=?",
                    [request.id]
                );
                await connection.commit();
                return res.status(400).json({error:"Mã đã hết hạn"});
            }

            const sessionToken=await createSession(connection,request);
            await connection.commit();

            setSessionCookie(res,sessionToken);
            res.clearCookie("lj_login_request",{path:"/"});
            res.json({authenticated:true,email:request.email});
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        next(error);
    }
});

app.post("/api/auth/logout",async (req,res,next)=>{
    try {
        const cookies=parseCookies(req.headers.cookie);
        const sessionToken=cookies.lj_session;

        if (sessionToken) {
            await pool.query("DELETE FROM magic_link_sessions WHERE session_hash=?",[sha256(sessionToken)]);
        }

        res.clearCookie("lj_session",{path:"/"});
        res.clearCookie("lj_login_request",{path:"/"});
        res.json({ok:true});
    } catch (error) {
        next(error);
    }
});

app.get("/api/auth/me",async (req,res,next)=>{
    try {
        const session=await getCurrentSession(req);

        if (!session) {
            return res.status(401).json({authenticated:false});
        }

        res.json({
            authenticated:true,
            email:session.email,
            expires_at:session.expires_at
        });
    } catch (error) {
        next(error);
    }
});

app.get("/api/random",async (_req,res,next)=>{
    try {
        const value=Math.floor(Math.random()*1000000);
        const [result]=await pool.query("INSERT INTO random_numbers (value) VALUES (?)",[value]);
        const [rows]=await pool.query(
            "SELECT id,value,created_at FROM random_numbers WHERE id=?",
            [result.insertId]
        );

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
});

app.get("/api/random/history",async (_req,res,next)=>{
    try {
        const [rows]=await pool.query(
            "SELECT id,value,created_at FROM random_numbers ORDER BY id DESC LIMIT 20"
        );

        res.json(rows);
    } catch (error) {
        next(error);
    }
});

app.get("/qwerty",async (_req,res,next)=>{
    try {
        const [tables]=await pool.query("SHOW TABLES");
        const tableKey=`Tables_in_${process.env.DB_NAME||"hello_world"}`;
        const data={};

        for (const table of tables) {
            const tableName=table[tableKey];
            const [columns]=await pool.query("SHOW COLUMNS FROM ??",[tableName]);
            const [rows]=await pool.query("SELECT * FROM ?? ORDER BY 1 DESC LIMIT 100",[tableName]);

            data[tableName]={
                columns:columns.map((column)=>({
                    field:column.Field,
                    type:column.Type,
                    null:column.Null,
                    key:column.Key,
                    default:column.Default,
                    extra:column.Extra
                })),
                rows:rows.map(sanitizeDebugRow)
            };
        }

        res.set("Cache-Control","no-store");
        res.json({
            database:process.env.DB_NAME||"hello_world",
            limitPerTable:100,
            tables:data
        });
    } catch (error) {
        next(error);
    }
});

app.get("/login/:code",async (req,res,next)=>{
    try {
        const code=req.params.code;

        if (!/^[A-Za-z0-9]{30}$/.test(code)) {
            return res.status(404).send("Magic link không tồn tại.");
        }

        const codeHash=sha256(code);
        const connection=await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [requests]=await connection.query(
                `SELECT id,email,status,expires_at,used_at
                 FROM magic_link_requests
                 WHERE code_hash=?
                 LIMIT 1
                 FOR UPDATE`,
                [codeHash]
            );
            const request=requests[0];

            if (!request) {
                await connection.rollback();
                return res.status(404).send("Magic link không tồn tại.");
            }

            if (request.used_at) {
                await connection.rollback();
                return res.status(400).send("Magic link đã được sử dụng.");
            }

            if (new Date(request.expires_at).getTime()<Date.now()) {
                await connection.query(
                    "UPDATE magic_link_requests SET status='expired' WHERE id=?",
                    [request.id]
                );
                await connection.commit();
                return res.status(400).send("Magic link đã hết hạn.");
            }

            const sessionToken=await createSession(connection,request);
            await connection.commit();

            setSessionCookie(res,sessionToken);
            res.clearCookie("lj_login_request",{path:"/"});
            res.redirect("/");
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        next(error);
    }
});

app.use(express.static(appRoot));

app.get("/",(_req,res)=>{
    res.sendFile(path.join(appRoot,"index.html"));
});

app.use((error,_req,res,_next)=>{
    console.error(error);
    res.status(500).json({error:"Internal server error"});
});

ensureTables()
    .then(()=>{
        app.listen(PORT,"0.0.0.0",()=>{
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((error)=>{
        console.error("Failed to initialize database",error);
        process.exit(1);
    });
