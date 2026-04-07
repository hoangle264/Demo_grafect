1.Mục tiêu dự án.

- Dự án này là một công cụ dựa trên Web (HTML/JS/CSS) dùng để thiết kế sơ đồ Grafcet (SFC - Sequential Function Chart) và tự động tạo mã nguồn (Code Generation) từ sơ đồ đó.

Nguyên tắc:

Đây là một ứng dụng Client-side thuần túy (không backend).

Logic chính nằm ở việc quản lý các đối tượng: Steps (Bước), Transitions (Chuyển tiếp), và Actions (Hành động).

AI phải tuân thủ tiêu chuẩn IEC 61131-3 khi gợi ý về logic Grafcet.

2.Cấu trúc và Vai trò các file.

Khi xử lý mã nguồn, AI cần truy xuất logic dựa trên các file sau:

grafcet-studio-v2.html: Điểm nhập (Entry point). Chứa cấu trúc DOM cho Canvas vẽ sơ đồ và các panel điều khiển.

grafcet-studio-v2.js: "Bộ não" của UI. Chứa logic vẽ (Canvas/SVG), xử lý sự kiện kéo thả, nối dây giữa các Step và Transition.

grafcet-studio-v2.css: Định nghĩa giao diện trực quan cho các thành phần Grafcet.

grafcet-codegen.js: Quan trọng nhất cho logic. Chứa các hàm biên dịch sơ đồ hiện tại thành mã lập trình (ví dụ: Structured Text, C, hoặc Arduino).

3.Cấu trúc nối tiếp: Một Step luôn phải được nối tới một Transition, và một Transition luôn phải dẫn đến một Step. Không bao giờ nối trực tiếp Step-Step hoặc Transition-Transition.

Quy tắc Logic (Logic Constraints)

Biến trạng thái: Mỗi Step có một biến Boolean (ví dụ: X1, X2) để biểu thị trạng thái kích hoạt.

Điều kiện chuyển tiếp: Một Transition chỉ nổ (fire) khi Step trước nó đang kích hoạt VÀ điều kiện logic của Transition đó đúng.

4.Hướng dẫn phát triển cho AI

- UI/UX: Sử dụng Vanilla JavaScript (không dùng framework như React/Vue trừ khi được yêu cầu). Tương tác trực tiếp với DOM thông qua ID và Class định nghĩa trong grafcet-studio-v2.html.

- Data Model: Sơ đồ được lưu trữ dưới dạng một mảng các đối tượng (Objects) chứa tọa độ (x, y), ID, và liên kết (links).

- Codegen: Khi chỉnh sửa grafcet-codegen.js, hãy đảm bảo hàm xuất mã quét qua toàn bộ danh sách Steps và Transitions để xây dựng vòng lặp quét (scan cycle) đúng thứ tự.

5.Stack kỹ thuật

- Ngôn ngữ: JavaScript (ES6+), HTML5, CSS3.

- Đồ họa: HTML5 Canvas hoặc SVG (Kiểm tra trong grafcet-studio-v2.js để xác định phương pháp hiện tại).



