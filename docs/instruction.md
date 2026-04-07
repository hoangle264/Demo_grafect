1.Mục tiêu dự án.

- Dự án này là một công cụ dựa trên Web (HTML/JS/CSS) dùng để thiết kế sơ đồ Grafcet (SFC - Sequential Function Chart) và tự động tạo mã nguồn (Code Generation) từ sơ đồ đó.

Nguyên tắc:

Đây là một ứng dụng Client-side thuần túy (không backend).

Logic chính nằm ở việc quản lý các đối tượng: Steps (Bước), Transitions (Chuyển tiếp), và Actions (Hành động).

AI phải tuân thủ tiêu chuẩn IEC 61131-3 khi gợi ý về logic Grafcet.

2.Cấu trúc dự án.

/Demo_grafect
├── /src                          (Chứa mã nguồn chính)
│   ├── /assets                   (Ảnh, icon, font)
│   ├── /css
│   │   └── grafcet-studio-v2.css (Định nghĩa giao diện trực quan cho các thành phần Grafcet)
│   ├── /js
│   │   ├── /modules              (Chia nhỏ logic từ các file lớn)
│   │   │   ├── ui-controller.js  (Quản lý giao diện: sự kiện, panel, toolbar, DOM)
│   │   │   ├── code-generator.js (Sinh mã nguồn: Structured Text, C, Arduino)
│   │   │   └── grafcet-core.js   (Data Model, logic IEC 61131-3 cốt lõi)
│   │   ├── grafcet-studio-v2.js  (File chính điều phối, gọi các module)
│   │   └── grafcet-codegen.js    (Hàm biên dịch sơ đồ thành mã lập trình)
│   └── index.html                (Entry point - đổi tên từ grafcet-studio-v2.html)
├── /config                       (Cấu hình dự án)
├── /docs                         (Tài liệu)
│   ├── instruction.md            (Hướng dẫn phát triển cho AI)
│   └── gencode.md                (Tài liệu về sinh mã nguồn)
├── README.md
└── package.json                  (Quản lý thư viện nếu dùng npm)

3.Vai trò các file chính.

Khi xử lý mã nguồn, AI cần truy xuất logic dựa trên các file sau:

src/index.html: Điểm nhập (Entry point). Chứa cấu trúc DOM cho Canvas vẽ sơ đồ và các panel điều khiển.

src/js/grafcet-studio-v2.js: File chính điều phối. Gọi và kết nối các module, khởi tạo ứng dụng.

src/js/modules/ui-controller.js: Quản lý toàn bộ giao diện người dùng: sự kiện kéo thả, panel, toolbar, cập nhật DOM.

src/js/modules/grafcet-core.js: Logic lõi của Grafcet. Quản lý Data Model (Steps, Transitions, Actions), đảm bảo tuân thủ IEC 61131-3.

src/js/modules/code-generator.js: Tách riêng logic sinh mã. Chứa các hàm biên dịch sơ đồ thành Structured Text, C, Arduino.

src/js/grafcet-codegen.js: File gốc chứa các hàm biên dịch sơ đồ hiện tại thành mã lập trình (Structured Text, C, Arduino).

src/css/grafcet-studio-v2.css: Định nghĩa giao diện trực quan cho các thành phần Grafcet.

4.Cấu trúc nối tiếp: Một Step luôn phải được nối tới một Transition, và một Transition luôn phải dẫn đến một Step. Không bao giờ nối trực tiếp Step-Step hoặc Transition-Transition.

Quy tắc Logic (Logic Constraints)

Biến trạng thái: Mỗi Step có một biến Boolean (ví dụ: X1, X2) để biểu thị trạng thái kích hoạt.

Điều kiện chuyển tiếp: Một Transition chỉ nổ (fire) khi Step trước nó đang kích hoạt VÀ điều kiện logic của Transition đó đúng.

5.Hướng dẫn phát triển cho AI

- UI/UX: Sử dụng Vanilla JavaScript (không dùng framework như React/Vue trừ khi được yêu cầu). Tương tác trực tiếp với DOM thông qua ID và Class định nghĩa trong src/index.html.

- Data Model: Sơ đồ được lưu trữ dưới dạng một mảng các đối tượng (Objects) chứa tọa độ (x, y), ID, và liên kết (links). Logic này nằm trong src/js/modules/grafcet-core.js.

- Codegen: Khi chỉnh sửa logic sinh mã, hãy làm việc với src/js/grafcet-codegen.js hoặc src/js/modules/code-generator.js. Đảm bảo hàm xuất mã quét qua toàn bộ danh sách Steps và Transitions để xây dựng vòng lặp quét (scan cycle) đúng thứ tự.

- Modules: Khi thêm tính năng mới, ưu tiên tách logic vào đúng module trong /src/js/modules/ thay vì thêm vào file chính.

6.Stack kỹ thuật

- Ngôn ngữ: JavaScript (ES6+), HTML5, CSS3.

- Đồ họa: HTML5 Canvas hoặc SVG (Kiểm tra trong src/js/grafcet-studio-v2.js để xác định phương pháp hiện tại).
