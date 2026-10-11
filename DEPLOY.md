# Deploy lên lebronjames.io.vn

Từ lần sau, vào SSH rồi chạy đúng một lệnh:

```bash
cd /home/viettuong/Lebron
./deploy.sh
```

Script sẽ tự động:

1. Build image app mới nhất.
2. Start/restart app và MySQL bằng Docker Compose.
3. Chờ endpoint `/qwerty` phản hồi.
4. Đổi Nginx proxy về `127.0.0.1:3001`.
5. Kiểm tra cấu hình Nginx.
6. Reload Nginx.
7. Kiểm tra URL public.

## Sau khi deploy

- Website: <https://lebronjames.io.vn/>
- Xem dữ liệu JSON: <https://lebronjames.io.vn/qwerty>
- Xem trạng thái container:

```bash
docker compose ps
```

- Xem log app:

```bash
docker compose logs -f app
```

- Xem log MySQL:

```bash
docker compose logs -f mysql
```

## Nếu script chưa có quyền chạy

Chạy một lần:

```bash
chmod +x deploy.sh
```

## Lưu ý

- Script cần quyền `sudo` để sửa/reload Nginx.
- Script tạo backup Nginx tại `/etc/nginx/sites-available/lebronjames.io.vn.deploy.bak` trước khi sửa.
- Nếu Nginx validate thất bại, script tự khôi phục bản backup.
- Docker Compose đã khóa project name là `hello-world`, nên dữ liệu MySQL vẫn nằm trong volume `hello-world_mysql_data` kể cả khi thư mục tên là `Lebron`.
- Không chạy `docker compose down -v` nếu chưa muốn xóa database.
