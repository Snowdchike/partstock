# Hướng dẫn chạy PartStock

App **self-host**: cài trên máy mình, data nằm trên máy mình. Mỗi tài khoản chỉ thấy data của mình (ownership).

## Cần gì

- **Node.js 20+** (`node -v`)
- Git
- Trình duyệt (Chrome / Firefox / Edge)

Không cần Docker, PostgreSQL hay cloud nếu dùng SQLite (mặc định).

## Cài lần đầu

```bash
# 1. Clone (repo private — cần invite GitHub, hoặc clone hộ)
git clone https://github.com/Snowdchike/partstock.git
cd partstock

# 2. Cài dependency
npm install

# 3. Tạo secret (copy dòng in ra, dán vào bước 5)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 4. Tạo database
cd backend
DATABASE_URL="file:./dev.db" npx prisma db push
cd ..
```

## Chạy (production — 1 cổng, UI + API)

Trong thư mục `backend`:

```bash
cd backend

export NODE_ENV=production
export HOST=0.0.0.0
export PORT=3001
export DATABASE_URL="file:./dev.db"
export SESSION_SECRET="DÁN_SECRET_Ở_BƯỚC_3_VÀO_ĐÂY"
export ALLOWED_ORIGINS="http://127.0.0.1:3001,http://localhost:3001"

# Nếu máy khác trong LAN truy cập (vd http://192.168.1.10:3001):
# export ALLOWED_ORIGINS="http://127.0.0.1:3001,http://localhost:3001,http://192.168.1.10:3001"

npx tsx src/server.ts
```

Mở trình duyệt: **http://127.0.0.1:3001**

Lần đầu: **Tạo tài khoản** (user đầu tiên = admin). Người khác tự đăng ký account riêng → data tách, không nhìn thấy kho của nhau.

## Dùng hằng ngày

| Tab | Việc |
|-----|------|
| **Linh kiện** | Thêm part đã mua (tên, MPN, hãng, ghi chú) |
| **Vị trí** | Ngăn / hộp / kệ |
| **Tồn kho** | Xem tổng / cảnh báo thấp (điều chỉnh qua API hoặc mở rộng UI sau) |
| **BOM / Lắp ráp / Nhãn** | Tuỳ chọn — không bắt buộc nếu chỉ quản lý “đã mua gì” |

## Backup data

File SQLite (quan trọng):

```text
backend/prisma/dev.db
```

Copy file này đi chỗ an toàn (USB / NAS). Khôi phục = copy lại đúng path rồi chạy server.

```bash
# ví dụ backup
cp backend/prisma/dev.db ~/backup/partstock-$(date +%Y%m%d).db
```

## Cập nhật code mới

```bash
cd partstock
git pull
npm install
cd frontend && npm run build && cd ..
cd backend
DATABASE_URL="file:./dev.db" npx prisma db push
# rồi chạy lại như mục "Chạy"
```

`frontend/dist` thường đã có sẵn trong repo; `npm run build` chỉ cần khi muốn rebuild UI.

## Lỗi thường gặp

| Hiện tượng | Cách xử |
|------------|---------|
| Trang trắng / không đăng nhập được | Xem `SESSION_SECRET` đủ dài (≥32), `ALLOWED_ORIGINS` khớp URL đang mở |
| `Frontend bundle not found` | `cd frontend && npm run build` |
| Port 3001 bận | Đổi `PORT=3002` và thêm origin tương ứng |
| Quên mật khẩu | Xoá session DB hoặc tạo user mới; admin đầu tiên tạo lúc DB trống |

## Bảo mật gợi ý

- Chỉ mở `HOST=0.0.0.0` trong LAN tin cậy, hoặc reverse proxy HTTPS.
- Không commit file `.env` / `dev.db` lên Git.
- Mỗi người một account — **đừng share login**.

## Dev / health

- Repo private: https://github.com/Snowdchike/partstock  
- Health check: `curl http://127.0.0.1:3001/api/health`  
- Test: `cd backend && npm test`
