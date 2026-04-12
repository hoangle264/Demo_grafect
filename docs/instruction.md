1.Mục tiêu dự án.

- Dự án này là một công cụ dựa trên Web (HTML/JS/CSS) dùng để thiết kế sơ đồ Grafcet (SFC - Sequential Function Chart) và tự động tạo mã nguồn (Code Generation) từ sơ đồ đó.

Nguyên tắc:

Đây là một ứng dụng Client-side thuần túy (không backend).

Logic chính nằm ở việc quản lý các đối tượng: Steps (Bước), Transitions (Chuyển tiếp), và Actions (Hành động).

AI phải tuân thủ tiêu chuẩn IEC 61131-3 khi gợi ý về logic Grafcet.

2.Cấu trúc dự án.

/Demo_grafect
├── /src                                (Mã nguồn chính)
│   ├── index.html                      (Entry point — cấu trúc DOM, tải toàn bộ script)
│   ├── /css
│   │   └── grafcet-studio.css          (Giao diện: màu sắc, layout, panel, SVG elements)
│   ├── /js
│   │   ├── /vendor                     (Thư viện bên thứ ba — local, không dùng CDN)
│   │   │   └── handlebars.min.js       (Handlebars v4.7.9 — bản local để hỗ trợ offline/file://)
│   │   ├── /core                       (Nền tảng — phải tải TRƯỚC mọi module khác)
│   │   │   ├── constants.js            (Hằng số kích thước, tất cả biến global runtime)
│   │   │   ├── store.js                (Project state singleton, lưu/tải localStorage)
│   │   │   ├── utils.js                (Hàm tiện ích thuần túy dùng chung)
│   │   │   └── graph-utils.js          (Duyệt đồ thị: topological sort, path finding)
│   │   ├── /editor                     (Chức năng bộ soạn thảo sơ đồ)
│   │   │   ├── actions.js              (IEC 61131-3 action qualifiers, bảng action)
│   │   │   ├── panels.js               (Quản lý panel/sidebar, init ứng dụng)
│   │   │   ├── canvas.js               (Render SVG: steps, transitions, connections)
│   │   │   ├── elements.js             (Thêm/xóa/chọn elements, công cụ align)
│   │   │   ├── events.js               (Sự kiện chuột/bàn phím, drag, snap, zoom)
│   │   │   ├── tree.js                 (Sidebar tree: units, devices, folders, modes)
│   │   │   ├── project.js              (Quản lý project/diagram: mở, lưu, đổi tên)
│   │   │   ├── export.js               (Import/Export JSON, SVG, HTML)
│   │   │   ├── tables.js               (Modal bảng xuất: steps, transitions, branches)
│   │   │   └── vars.js                 (Bảng biến I/O: hiển thị, sửa, CSV import/export)
│   │   └── /codegen                    (Sinh mã nguồn PLC)
│   │       ├── kv-generator.js         (Canvas-based KV/PLC generator legacy; hỗ trợ kv_main.hbs/kv_step.hbs)
│   │       ├── sequence.js             (Giải trình tự Grafcet từ canvas; dùng chung cho KV path và Unit Config context)
│   │       ├── st-generator.js         (IEC 61131-3 Structured Text — demo/stub; hỗ trợ st_main.hbs tùy chỉnh)
│   │       ├── templates-bundle.js     (Tất cả .hbs nhúng inline vào JS — hỗ trợ offline/file:// cho Unit Config templates)
│   │       ├── unit-config.js          (Unit Config JSON engine chính + Handlebars template rendering strict/non-strict)
│   │       ├── template-manager.js     (Registry template động cho Unit Config + legacy KV/ST templates; validate, health check, localStorage)
│   │       ├── runtime-metadata.js     (Chuẩn hóa metadata runtime cho execute/feedback mapping)
│   │       ├── runtime-resolver.js     (Resolve runtime signals và step semantics từ project/unit config)
│   │       ├── runtime-planner.js      (Lập runtime execution plan từ canvas + metadata)
│   │       ├── output-binding-planner.js (Lập output binding plan cho device outputs/runtime)
│   │       ├── runtime-debug.js        (Build target Runtime Plan [debug] để inspect pipeline)
│   │       └── modal.js                (Modal UI sinh mã: chọn target, preview, copy/download; có panel Template Manager)
│   └── /templates                      (Handlebars .hbs templates cho sinh mã IL)
│       ├── auto.hbs                    (Template chế độ Auto)
│       ├── error.hbs                   (Template chế độ Error)
│       ├── manual.hbs                  (Template chế độ Manual)
│       ├── origin.hbs                  (Template chế độ Origin)
│       ├── output.hbs                  (Template section Output)
│       ├── main-output.hbs             (Dispatcher tổng hợp output cho từng device kind)
│       ├── step-body.hbs               (Partial: phần completion của mỗi Step — LD/AND/SET)
│       ├── step-body-1.hbs             (Partial thay thế: có header comment + "no feedback" fallback)
│       └── /devices                    (Partials thiết bị)
│           ├── cylinder.hbs            (Template IL cho xy-lanh)
│           ├── motor.hbs               (Template IL cho motor)
│           └── servo.hbs               (Template IL cho servo)
├── /config                             (Cấu hình hệ thống — chỉ chứa templates & libraries)
│   ├── cylinder-types.json             (Định nghĩa loại xy-lanh)
│   ├── device-library.json             (Thư viện thiết bị)
│   ├── plc-profiles.json               (Profile PLC các hãng)
│   ├── unit-templates.json             (Template unit chuẩn)
│   ├── infeed-unit-v3.json             (Ví dụ unit config v3)
│   └── Code gen.txt                    (Ví dụ mã IL sinh ra — dùng làm tham khảo)
├── /projects                           (Dữ liệu project người dùng)
│   └── infeed-unit.json                (Ví dụ project Grafcet)
├── /docs                               (Tài liệu)
│   ├── instruction.md                  (Hướng dẫn phát triển cho AI — file này)
│   └── gencode.md                      (Tài liệu chi tiết về sinh mã nguồn)
└── package.json                        (Metadata dự án)

3.Vai trò các file chính.

Khi xử lý mã nguồn, AI cần truy xuất logic dựa trên các file sau:

src/index.html: Điểm nhập (Entry point). Chứa cấu trúc DOM cho Canvas vẽ sơ đồ và các panel điều khiển. Tải tất cả script theo thứ tự: core → editor → codegen; thứ tự chi tiết của codegen phải bám theo file thực tế trong index.html.

src/js/core/constants.js: Khai báo TẤT CẢ hằng số (SW, SH, TW, TH, GRID…) và biến global runtime (state, tool, selIds, viewX/Y/Scale…). Phải tải đầu tiên.

src/js/core/store.js: Project state singleton. Quản lý `project`, `openTabs`, `activeDiagramId`. Lưu/tải localStorage, flushState(), loadDiagramData().

src/js/core/utils.js: Hàm tiện ích thuần túy dùng chung (toast, esc2, closeModal, downloadFile…).

src/js/core/graph-utils.js: Duyệt đồ thị Grafcet thuần túy (topological sort, path finding, resolveStepsThrough).

src/js/editor/actions.js: Xử lý IEC 61131-3 action qualifiers (N, S, R, P, L, D…). Render bảng action trong right panel.

src/js/editor/panels.js: Quản lý trạng thái panel sidebar/rpanel. Chứa hàm `init()` khởi tạo toàn bộ ứng dụng.

src/js/editor/canvas.js: Render toàn bộ sơ đồ bằng SVG (steps, transitions, parallel bars, connections, grid).

src/js/editor/elements.js: Thêm/xóa/chọn elements trên canvas. Công cụ align. Hàm setTool().

src/js/editor/events.js: Xử lý toàn bộ sự kiện chuột (drag, pan, select box, resize) và bàn phím. Snap to grid.

src/js/editor/tree.js: Render sidebar tree (units, modes, devices, folders). Quản lý device types và modal properties.

src/js/editor/project.js: Thêm/xóa/đổi tên diagram và project. Mở tab, lưu diagram, newProject().

src/js/editor/export.js: Import project JSON, export JSON/SVG/HTML. updateStats(), miniMap(), afterChange().

src/js/editor/tables.js: Modal "Export Tables" — bảng steps, transitions, branches, variables dạng HTML/CSV.

src/js/editor/vars.js: Bảng biến I/O (Variable Table) — hiển thị, inline edit, import/export CSV.

src/js/codegen/kv-generator.js: Sinh KV/PLC code theo nhánh canvas legacy. Hỗ trợ multi-diagram, output section, device template, và translate instruction theo PLC profile. Nếu `kv_main.hbs` có trong localStorage → toàn bộ output được render qua Handlebars với context đầy đủ (project, diagrams, steps). Nếu `kv_step.hbs` có trong localStorage → dùng làm template per-step thay thế STEP_ACTIVATION_TEMPLATE / STEP_FEEDBACK_TEMPLATE (hai block phân cách bằng dòng `;;;`). Nếu template custom lỗi thì fallback về logic mặc định.

src/js/codegen/sequence.js: Giải trình tự Grafcet (cgResolveSequence). Duyệt connections để tạo danh sách bước theo thứ tự đúng. Đây là primitive dùng chung cho cả KV generator và các bước build context của Unit Config.

src/js/codegen/st-generator.js: Sinh IEC 61131-3 Structured Text (demo/stub). Dùng làm tham khảo cấu trúc. Nếu `st_main.hbs` có trong localStorage → toàn bộ output được render qua Handlebars. Fallback về logic mặc định nếu template lỗi.

src/js/codegen/templates-bundle.js: Nhúng toàn bộ nội dung file `.hbs` vào JS dưới dạng chuỗi literal (UC_TEMPLATE_BUNDLE + UC_PARTIAL_BUNDLE). Khai báo hàm `ucInjectBundledTemplates()` để biên dịch template và đăng ký Handlebars partials/helpers khi được gọi bởi unit-config.js. Phải tải TRƯỚC unit-config.js. Không tự chạy lúc load — chờ `UC_TEMPLATE_CACHE` được khởi tạo trong unit-config.js.

src/js/codegen/unit-config.js: Engine sinh Unit Config JSON (v3) và là nhánh codegen chính hiện tại cho target `Unit Config JSON`. File này tự tính flags hệ thống, IO hệ thống, admin addresses và build context từ `unitConfig` + project canvas. Địa chỉ signal vật lý `_SOL` / `_SNS` không hardcode trong JSON mà được quét từ Variable Table của diagrams. Khai báo `UC_TEMPLATE_CACHE = {}` rồi gọi `ucInjectBundledTemplates()` ngay lập tức để nạp bundle vào cache. Nếu bundle chưa có (templates-bundle.js chưa tải), fallback sang fetch `.hbs` từ thư mục templates khi page load. Luồng Unit Config hỗ trợ strict template rendering để chặn generate khi template library invalid.

src/templates/*.hbs: Handlebars templates định nghĩa nội dung mã IL cho từng section của Unit Config (Error, Manual, Origin, Auto, main-output/output). Mỗi template nhận context object với đầy đủ thông tin unit/device/steps/station flows. Ưu tiên sửa file .hbs khi cần đổi section output mà không muốn sửa JS generator.

src/templates/devices/*.hbs: Handlebars partials cho từng loại thiết bị (cylinder, motor, servo). Được đăng ký qua `Handlebars.registerPartial` và gọi từ `main-output.hbs`.

src/js/codegen/modal.js: Modal UI "Generate Code" — chọn target, preview code, download/copy. Có 3 nhánh chính trong UI: canvas legacy (`kv-*`, `melsec`, `omron`, `siemens`, `st`), `Unit Config JSON`, và `Runtime Plan [debug]`. Khi chọn target `Unit Config JSON`: hiện panel load file JSON, radio button chọn unit trong project, kiểm tra template health qua Template Manager rồi gọi `cgGenerateFromUnitConfig()` với `selectedUnitId` và `strictTemplates: true`. Nếu template library invalid thì preview/copy/download bị chặn.

src/js/codegen/template-manager.js: Hệ thống template động. Cho phép người dùng nạp file `.hbs` từ máy tính qua `<input type="file">`, validate bằng `Handlebars.compile()`, lưu vào localStorage. Đối với Unit Config, file upload được quản lý qua registry explicit thay vì suy đoán theo tên file: `error.hbs`, `manual.hbs`, `origin.hbs`, `auto.hbs`, `main-output.hbs`, `output.hbs`, `step-body.hbs`, `cylinder.hbs`, `servo.hbs`, `motor.hbs`. Registry này điều khiển localStorage key dạng `custom_tpl_uc_*`, đăng ký partial, UI state, migration từ legacy keys và template health validation. Legacy path cho `kv_main.hbs`, `kv_step.hbs`, `st_main.hbs` vẫn được giữ riêng.

src/js/codegen/runtime-metadata.js: Chuẩn hóa và đọc metadata runtime/device để phục vụ planning/debug.

src/js/codegen/runtime-resolver.js: Resolve dữ liệu runtime từ diagram, action, transition, signal mapping và unit config.

src/js/codegen/runtime-planner.js: Xây runtime execution plan từ sequence, metadata và binding information.

src/js/codegen/output-binding-planner.js: Tạo output binding plan cho từng thiết bị/signal trong runtime path.

src/js/codegen/runtime-debug.js: Dựng preview `Runtime Plan [debug]` trong modal để kiểm tra pipeline runtime mà không generate IL production.

src/css/grafcet-studio.css: Toàn bộ giao diện: màu sắc CSS variables, layout panel, toolbar, SVG element styles.

4.Cấu trúc nối tiếp: Một Step luôn phải được nối tới một Transition, và một Transition luôn phải dẫn đến một Step. Không bao giờ nối trực tiếp Step-Step hoặc Transition-Transition.

Quy tắc Logic (Logic Constraints)

Biến trạng thái: Mỗi Step có một biến Boolean (ví dụ: X1, X2) để biểu thị trạng thái kích hoạt.

Điều kiện chuyển tiếp: Một Transition chỉ nổ (fire) khi Step trước nó đang kích hoạt VÀ điều kiện logic của Transition đó đúng.

5.Hướng dẫn phát triển cho AI

- UI/UX: Sử dụng Vanilla JavaScript (ES6+, "use strict") — không dùng framework như React/Vue trừ khi được yêu cầu. Tương tác trực tiếp với DOM thông qua ID và Class định nghĩa trong src/index.html. Không dùng bundler — tất cả JS được tải qua thẻ `<script>` trong HTML.

- Data Model: Sơ đồ được lưu trữ dưới dạng object `state` gồm `{steps, transitions, parallels, connections}`. Biến global `project` (trong src/js/core/store.js) chứa toàn bộ project kể cả tất cả diagrams.

- Thứ tự tải script (quan trọng): phải theo đúng `src/index.html`. Ở thời điểm hiện tại, phần codegen được tải theo thứ tự: `codegen/kv-generator.js` → `codegen/sequence.js` → `codegen/st-generator.js` → `codegen/templates-bundle.js` → `codegen/unit-config.js` → `codegen/template-manager.js` → `codegen/runtime-metadata.js` → `codegen/runtime-resolver.js` → `codegen/runtime-planner.js` → `codegen/output-binding-planner.js` → `codegen/runtime-debug.js` → `codegen/modal.js`. Các biến global phải được khai báo trước khi dùng.

- Codegen: Phải xác định đúng target trước khi sửa.
	- Nhánh canvas legacy (`kv-*`, `melsec`, `omron`, `siemens`, `st`): làm việc chủ yếu với `src/js/codegen/kv-generator.js`, `src/js/codegen/st-generator.js`, và `src/js/codegen/sequence.js`.
	- Nhánh `Unit Config JSON`: làm việc chủ yếu với `src/js/codegen/unit-config.js`, `src/js/codegen/template-manager.js`, `src/js/codegen/templates-bundle.js`, và các file `.hbs` trong `src/templates/`.
	- Nhánh `Runtime Plan [debug]`: làm việc với `runtime-metadata.js`, `runtime-resolver.js`, `runtime-planner.js`, `output-binding-planner.js`, `runtime-debug.js`.
	- Với Unit Config, thứ tự bước vẫn lấy từ canvas/sequence; JSON không phải nguồn sự thật cho flow order.

- Templates: Khi tùy chỉnh nội dung mã IL của Unit Config (nội dung từng section), ưu tiên chỉnh sửa file `.hbs` trong `src/templates/` thay vì sửa JS generator. `unit-config.js` sẽ nạp bundled templates trước; nếu bundle chưa sẵn thì mới fetch `.hbs` khi page load. Nếu cần thêm Handlebars helper, đăng ký trong hàm `ucRegisterHandlebarsHelpers()` ở `src/js/codegen/unit-config.js`. Người dùng cũng có thể nạp file `.hbs` tùy chỉnh trực tiếp từ Template Manager để ghi đè template mặc định mà không cần sửa source code.
	- Với Unit Config preview trong modal, template health được kiểm tra trước khi generate.
	- Khi modal đang chạy strict template mode, template lỗi hoặc thiếu partial bắt buộc phải chặn preview/copy/download, không fallback im lặng.

- Modules: Khi thêm tính năng mới, ưu tiên tách logic vào đúng module trong src/js/editor/ hoặc src/js/codegen/ tương ứng với chức năng, thay vì tập trung vào một file lớn.

- Biến global: Khai báo biến global MỚI trong src/js/core/constants.js. Không khai báo lại biến đã có ở file khác.

6.Stack kỹ thuật

- Ngôn ngữ: JavaScript (ES6+, "use strict"), HTML5, CSS3.

- Đồ họa: SVG (inline, tạo động qua DOM). Xem src/js/editor/canvas.js.

- Lưu trữ: localStorage (project state). Xem src/js/core/store.js.

- Templating: Handlebars.js v4.7.9 — bản **local** tại `src/js/vendor/handlebars.min.js` (không dùng CDN, hỗ trợ offline và file://). Nội dung template `.hbs` của Unit Config được nhúng inline vào `src/js/codegen/templates-bundle.js`. Khi target là `Unit Config JSON`, `ucInjectBundledTemplates()` biên dịch bundle vào `UC_TEMPLATE_CACHE`; `unit-config.js` dùng cache đó để sinh mã IL. Nếu bundle chưa sẵn thì `unit-config.js` có thể fetch từ thư mục `templates/` khi page load. **Template động (runtime override):** `template-manager.js` cho phép nạp file `.hbs` từ máy tính, lưu vào localStorage theo registry Unit Config (`custom_tpl_uc_*`) hoặc legacy key (`custom_tpl_<filename>`), tự động ghi đè `UC_TEMPLATE_CACHE` và đăng ký Handlebars partials tương ứng. Hàm `tmGetCustomTemplate(filename)` trả về string template tùy chỉnh hoặc null. Helpers hiện có: `pad`, `eq`, `padStart2`. Xem `src/js/codegen/templates-bundle.js`, `src/js/codegen/unit-config.js`, và `src/js/codegen/template-manager.js`.
