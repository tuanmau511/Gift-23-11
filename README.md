# Một chút bất ngờ cho Vy

Trang sinh nhật tương tác, chạy bằng Node.js 20.12 trở lên. Dự án 20/10 trong thư mục `Gift 20_10` được giữ nguyên.

## Chạy trên máy

Tạo tệp `.env` tại thư mục gốc của dự án (cùng cấp với `server.js`, không đặt trong `public`) với nội dung:

```dotenv
ADMIN_PASSWORD=thay-bang-mat-khau-dai-va-rieng
```

Sau đó mở PowerShell tại thư mục này và chạy:

```powershell
npm start
```

Mở `http://localhost:3000` và để cửa sổ máy chủ chạy. Mật khẩu phải có ít nhất 12 ký tự; không chia sẻ hoặc đưa tệp `.env` lên mạng. Cũng có thể đặt `ADMIN_PASSWORD`, `PORT` và `DATA_DIR` bằng biến môi trường; biến môi trường có sẵn được ưu tiên hơn tệp `.env`. Không mở trực tiếp tệp HTML hoặc dùng Live Server vì trang cần backend.

## Thêm âm thanh

Tạo thư mục `public\audio` và chép hai tệp MP3:

- `public\audio\background.mp3`: nhạc nền.
- `public\audio\recording.mp3`: bản thu âm.

Trang thử phát nhạc ngay khi mở và phát lại sau 3 giây kể từ khi bài kết thúc. Trình duyệt điện thoại có thể chặn tự động phát cho tới lần chạm đầu tiên. Có thể tắt nhạc bằng nút ở góc trên. Bản ghi âm có nút Skip nếu chưa có tệp hoặc người nghe muốn bỏ qua.

## Nhật ký

Chạm nhân vật rồi nhập chính xác mật khẩu quản trị vào ô nhập tên để vào `/ad5112311`. Mật khẩu được kiểm tra ở máy chủ và không được ghi vào nhật ký. Lịch sử có mã người dùng, nội dung, thao tác và thời gian máy chủ. Trang có thông báo rằng các tin nhắn và thao tác được lưu. Giữ dữ liệu riêng tư, sao lưu nếu cần và xóa khi không còn cần thiết.

Khi chạy trên máy mà chưa cấu hình Supabase, lịch sử lưu trong `data\events.jsonl` (hoặc `DATA_DIR`), phiên quản trị mất khi khởi động lại. Khi cấu hình Supabase, lịch sử và phiên lưu trong cơ sở dữ liệu; phiên hết hạn sau 8 giờ hoặc khi đăng xuất. Dữ liệu cũ trong tệp local không được tự động chuyển lên Supabase.

## Triển khai Vercel + Supabase

1. Tạo một dự án Supabase. Trong **SQL Editor**, chạy toàn bộ nội dung tệp `supabase\schema.sql` để tạo bảng và hàm. Các bảng bật Row Level Security và không cấp quyền cho `anon` hay `authenticated`; không tạo policy công khai cho các bảng này.
2. Trong cài đặt API của Supabase, lấy **Project URL** và **Secret key** (`sb_secret_...`; cũng hỗ trợ khóa `service_role` kiểu cũ). Secret key có toàn quyền truy cập dự án: không gửi cho người khác, không đưa vào mã nguồn hoặc trình duyệt.
3. Đưa dự án lên Git rồi import vào Vercel, hoặc triển khai bằng Vercel CLI từ thư mục dự án. Trên Vercel, chọn **Other** nếu cần chọn framework; `vercel.json` đã cấu hình thư mục giao diện và đường dẫn quản trị. Chọn Node.js 22.x trong cài đặt dự án.
4. Trong **Vercel → Project → Settings → Environment Variables**, đặt ba biến cho môi trường triển khai:
   - `ADMIN_PASSWORD`: mật khẩu quản trị riêng, ít nhất 12 ký tự.
   - `SUPABASE_URL`: Project URL ở bước 2.
   - `SUPABASE_SECRET_KEY`: Secret key ở bước 2.
5. Deploy hoặc redeploy sau khi đặt biến. Mở trang bằng HTTPS, chạm nhân vật, nhập mật khẩu ở ô tên và kiểm tra nhật ký tại `/ad5112311`. Kiểm tra một hành động mới xuất hiện sau khi tải lại trang. Không chỉ mở `admin.html` trực tiếp.

Nếu muốn dùng Supabase khi chạy trên máy, đặt hai biến Supabase trên trong `.env` ở thư mục gốc rồi khởi động lại máy chủ. Nếu không đặt cả hai biến, chế độ local vẫn dùng tệp. Trên Vercel, thiếu cấu hình Supabase sẽ báo lỗi thay vì âm thầm lưu tạm. Supabase Data API phải được bật và giới hạn số dòng tối đa mỗi truy vấn phải từ 500 trở lên.

MP3 trong `public\audio` sẽ được công khai cùng trang. Chúng đang bị Git bỏ qua: nếu deploy từ Git, hãy chủ động đưa các tệp muốn chia sẻ vào repository trước khi deploy; nếu dùng CLI, đảm bảo chúng có trong thư mục dự án lúc upload. Không đưa `.env` hoặc `data` lên Git. Khi tự host ngoài Vercel, dùng HTTPS và đặt `NODE_ENV=production` để bật cookie bảo mật.

Chạy kiểm thử bằng `npm test`.
