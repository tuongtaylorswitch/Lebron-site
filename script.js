const welcomeBox = document.getElementById("welcome-box");
const welcomeMessage = document.getElementById("welcome-message");
const logoutButton = document.getElementById("logout-button");
const magicLinkForm = document.getElementById("magic-link-form");
const magicLinkButton = document.getElementById("magic-link-button");
const magicLinkResult = document.getElementById("magic-link-result");
const verifyCodeForm = document.getElementById("verify-code-form");
const verifyCodeButton = document.getElementById("verify-code-button");
const verifyCodeResult = document.getElementById("verify-code-result");
const loginCodeInput = document.getElementById("login-code");
const randomButton = document.getElementById("random-button");
const randomResult = document.getElementById("random-result");

function showLoggedIn(email) {
  welcomeMessage.textContent = `Xin chào ${email}`;
  welcomeBox.hidden = false;
  magicLinkForm.hidden = true;
  verifyCodeForm.hidden = true;
}

function showLoggedOut() {
  welcomeBox.hidden = true;
  magicLinkForm.hidden = false;
  verifyCodeForm.hidden = true;
  magicLinkForm.reset();
  verifyCodeForm.reset();
  magicLinkResult.textContent = "Nhập email để bắt đầu.";
  verifyCodeResult.textContent = "Mã nằm trong email vừa gửi. Chỉ dùng được trên máy này.";
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me");

    if (!response.ok) {
      return;
    }

    const data = await response.json();

    if (data.authenticated) {
      showLoggedIn(data.email);
    }
  } catch (error) {
    // Không cần báo lỗi ở UI nếu chỉ là chưa đăng nhập.
  }
}

magicLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(magicLinkForm);
  const email = formData.get("email");

  magicLinkResult.textContent = "Đang gửi magic link và mã 6 số...";
  magicLinkButton.disabled = true;

  try {
    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    magicLinkResult.textContent = `Đã gửi link và mã 6 số tới ${data.email}.`;
    verifyCodeForm.hidden = false;
    loginCodeInput.focus();
  } catch (error) {
    magicLinkResult.textContent = error.message || "Không gửi được email. Vui lòng thử lại.";
  } finally {
    magicLinkButton.disabled = false;
  }
});

verifyCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(verifyCodeForm);
  const code = formData.get("code");

  verifyCodeResult.textContent = "Đang xác nhận mã...";
  verifyCodeButton.disabled = true;

  try {
    const response = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    showLoggedIn(data.email);
  } catch (error) {
    verifyCodeResult.textContent = error.message || "Mã không đúng. Vui lòng thử lại.";
  } finally {
    verifyCodeButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await fetch("/api/auth/logout", { method: "POST" });
    showLoggedOut();
  } catch (error) {
    welcomeMessage.textContent = "Không đăng xuất được. Vui lòng thử lại.";
  } finally {
    logoutButton.disabled = false;
  }
});

randomButton.addEventListener("click", async () => {
  randomResult.textContent = "Đang lấy số random...";
  randomButton.disabled = true;

  try {
    const response = await fetch("/api/random");

    if (!response.ok) {
      throw new Error("Request failed");
    }

    const data = await response.json();
    randomResult.textContent = `Đã lưu số random: ${data.value} (ID: ${data.id})`;
  } catch (error) {
    randomResult.textContent = "Không lấy được số random. Vui lòng thử lại.";
  } finally {
    randomButton.disabled = false;
  }
});

loadCurrentUser();
