# Grafcet Studio — Hướng dẫn phát triển theo trạng thái dự án hiện tại

## 1. Mục tiêu dự án

Grafcet Studio là ứng dụng web client-side thuần HTML/CSS/JavaScript để:

- vẽ sơ đồ GRAFCET / SFC theo IEC 60848
- quản lý project gồm Unit, Diagram, Struct Data, Global Variables
- import dữ liệu thiết bị và Unit từ CSV
- sinh mã PLC từ dữ liệu project hiện tại

Ứng dụng không có backend. Toàn bộ trạng thái được giữ trong runtime global và lưu bằng `localStorage`.

Nguyên tắc quan trọng:

- Canvas là nguồn sự thật cho flow và thứ tự bước.
- `project` là nguồn sự thật của dữ liệu project-level.
- Codegen hiện tập trung vào nhánh `Unit Config JSON` và `Runtime Plan [debug]`.
- Nếu tài liệu khác mâu thuẫn với mã nguồn hiện tại, ưu tiên hành vi thực tế trong `src/`.

## 2. Cấu trúc thư mục

```text
/Demo_grafect
├── config/
│   ├── Code gen.txt
│   ├── cylinder-types.json
│   ├── device-library.json
│   ├── infeed-unit-v3.json
│   ├── plc-profiles.json
│   ├── runtime-device-metadata.sample.json
│   ├── sample-cylinders.csv
│   ├── sample-units.csv
│   └── unit-templates.json
├── docs/
│   ├── codegen-runtime-handoff.md
│   ├── excel-driven-config-plan.md
│   ├── gencode.md
│   ├── instruction.md
│   └── plan.md
├── projects/
│   └── infeed-unit.json
├── src/
│   ├── index.html
│   ├── css/
│   │   └── grafcet-studio.css
│   ├── js/
│   │   ├── codegen/
│   │   ├── core/
│   │   ├── editor/
│   │   └── vendor/
│   └── templates/
└── package.json
```

## 3. Load order thực tế

Thứ tự tải script phải bám đúng `src/index.html`. Thứ tự hiện tại là:

1. `js/vendor/handlebars.min.js`
2. `js/core/utils.js`
3. `js/core/graph-utils.js`
4. `js/core/store.js`
5. `js/core/constants.js`
6. `js/editor/actions.js`
7. `js/editor/panels.js`
8. `js/editor/canvas.js`
9. `js/editor/elements.js`
10. `js/editor/events.js`
11. `js/editor/tree.js`
12. `js/editor/project.js`
13. `js/editor/export.js`
14. `js/editor/tables.js`
15. `js/editor/vars.js`
16. `js/editor/excel-import.js`
17. `js/codegen/kv-generator.js`
18. `js/codegen/sequence.js`
19. `js/codegen/st-generator.js`
20. `js/codegen/templates-bundle.js`
21. `js/codegen/unit-config.js`
22. `js/codegen/template-manager.js`
23. `js/codegen/runtime-metadata.js`
24. `js/codegen/runtime-resolver.js`
25. `js/codegen/runtime-planner.js`
26. `js/codegen/output-binding-planner.js`
27. `js/codegen/runtime-debug.js`
28. `js/codegen/modal.js`

Không được giả định load order kiểu `constants -> utils -> store`. Hãy bám đúng file HTML hiện có.

## 4. Các module chính

### 4.1 Core

- `src/js/core/store.js`
  - giữ state project toàn cục: `project`, `openTabs`, `activeDiagramId`
  - persist vào `localStorage`
  - khai báo và đồng bộ `project.excelVars` và `project.unitConfig`
  - có `syncStructDataFromProjectData()` để tự tạo Struct Data type từ dữ liệu đang có

- `src/js/core/constants.js`
  - chứa runtime globals cho canvas/editor

- `src/js/core/utils.js`
  - các helper dùng chung như `toast`, `esc2`, `downloadFile`, `closeModal`

- `src/js/core/graph-utils.js`
  - helper duyệt đồ thị và path/sequence

### 4.2 Editor

- `src/js/editor/canvas.js`
  - render SVG canvas

- `src/js/editor/elements.js`
  - tạo/xóa/chọn element

- `src/js/editor/events.js`
  - chuột, bàn phím, drag, pan, snap

- `src/js/editor/tree.js`
  - Project tree, Unit, Diagram, Struct Data type

- `src/js/editor/project.js`
  - tạo project, add diagram, tab handling, unit assignment

- `src/js/editor/actions.js`
  - IEC 61131-3 action qualifiers và editor cho action

- `src/js/editor/vars.js`
  - quản lý `VARIABLE TABLE` cho diagram-local vars
  - quản lý `GLOBAL VARIABLES` panel cho `project.excelVars` và `project.unitConfig`

- `src/js/editor/excel-import.js`
  - modal import CSV
  - hỗ trợ import `Unit Station`, `Cylinder CSV`, `Struct Data`
  - sync dữ liệu import vào `project.excelVars` và/hoặc `project.unitConfig`

### 4.3 Codegen

- `src/js/codegen/unit-config.js`
  - engine generate IL từ unit config + project data + canvas
  - có fallback build synthetic config từ `project.unitConfig` hoặc `project.excelVars`

- `src/js/codegen/modal.js`
  - modal preview/copy/download code
  - target hiện tại chỉ có `unit-config` và `runtime-plan`

- `src/js/codegen/template-manager.js`
  - upload và validate template `.hbs`, lưu `localStorage`

- `src/js/codegen/templates-bundle.js`
  - bundle template mặc định vào JS để chạy offline/file://

- `src/js/codegen/runtime-*.js`
  - runtime metadata, resolver, planner, output binding, debug preview

- `src/js/codegen/sequence.js`
  - resolve sequence từ canvas

- `src/js/codegen/kv-generator.js`, `src/js/codegen/st-generator.js`
  - vẫn còn trong codebase nhưng không phải target chính trong modal hiện tại

## 5. Mô hình dữ liệu hiện tại

### 5.1 `project`

`project` trong `store.js` hiện có các nhánh quan trọng sau:

- `units: []`
- `diagrams: []`
- `devices: []`
- `excelVars: []`
- `unitConfig: {}`

### 5.2 Ba lớp dữ liệu cần phân biệt

1. `state.vars[]`
   - biến local của diagram đang mở
   - được lưu bằng `saveDiagramData()`
   - hiển thị trong `VARIABLE TABLE`

2. `project.excelVars[]`
   - dữ liệu thiết bị/struct import ở cấp project
   - là nguồn chính cho `Cylinder`, các struct tùy chỉnh, và `Unit Station` import qua Struct Data
   - được hiển thị trong `GLOBAL VARIABLES`

3. `project.unitConfig`
   - dữ liệu Unit Station kiểu legacy theo key unit label
   - vẫn có thể tồn tại trong project cũ hoặc khi import trực tiếp kiểu `Unit Station`
   - không còn là nguồn sự thật cho `Unit Station` import qua Struct Data
   - nếu có `project.excelVars` format `Unit Station`, codegen và Global Variables phải ưu tiên `excelVars`

### 5.3 Quy tắc merged view

- `getLocalVars()` chỉ trả về `state.vars`
- `getVars()` trả về `local vars + project.excelVars`
- `getVars()` không merge `project.unitConfig`
- `Unit Station` Struct Data trong `project.excelVars` là nguồn ưu tiên cho Global Variables và Unit Config codegen
- `project.unitConfig` chỉ là fallback/legacy, không được dùng để che hoặc ghi đè `excelVars` Unit Station

Điểm này rất quan trọng: không được nhầm `unitConfig` là một phần của `getVars()`, và không được mirror Struct Data `Unit Station` sang `unitConfig` nếu mục tiêu là codegen theo struct do user định nghĩa.

## 6. UI hiện tại

### 6.1 Sidebar trái

Sidebar hiện chỉ có 2 tab:

- `proj`
- `tools`

Không còn sidebar tab `vars` như một số tài liệu cũ mô tả.

### 6.2 Global Variables panel

`GLOBAL VARIABLES` là một panel riêng trong main area, không phải tab sidebar.

Nó có:

- ô filter `#gvt-search`
- count `#gvt-count`
- nút `📥 Import` để mở `showExcelImportModal()`
- bảng `#gvt-tbody`

### 6.3 Variable Table panel

`VARIABLE TABLE` phía dưới canvas chỉ quản lý `state.vars` của diagram hiện tại.

Nó có:

- add/edit/delete local vars
- import/export CSV cho local vars
- nút `📥 Excel` mở cùng modal import project-level data

## 7. Global Vars behavior

### 7.1 Nguồn dữ liệu hiển thị

`renderGlobalVarTable()` dùng `gvtGetEntries()` để hiển thị:

- `project.excelVars` là nguồn chính
- `project.unitConfig` chỉ còn là fallback legacy khi chưa có Unit Station trong `excelVars`

Với `Unit Station` import qua Struct Data, Global Variables phải hiện entry từ `project.excelVars` để địa chỉ signal được sửa trực tiếp trên `signalAddresses`.

### 7.2 Rule chống trùng Unit Station

Luồng mới không mirror `Struct Data = Unit Station` sang `project.unitConfig` nữa.

- nếu `project.excelVars` có entry `format === 'Unit Station'`, Global Vars hiển thị entry `excel` đó
- `project.unitConfig` không được tạo thêm từ Struct Data import
- nếu project cũ còn `project.unitConfig`, chỉ dùng như fallback legacy khi không có Unit Station trong `excelVars`

Mục tiêu là một lần import Unit Station qua Struct Data chỉ tạo một dòng Global Variables và xóa một lần là hết.

### 7.3 Edit signal address trực tiếp

Global Vars cho phép sửa trực tiếp địa chỉ signal:

- với entry `excel`: ghi vào `project.excelVars[idx].signalAddresses[sig.id]`
- với entry `unit`: ghi vào nested path trong `project.unitConfig[key]` (legacy fallback)

Sau khi sửa sẽ `saveProject()`.

Với Unit Station Struct Data, đường edit đúng là entry `excel`; không sửa nested `project.unitConfig`.

## 8. Struct Data và tự đồng bộ

`store.js` có `syncStructDataFromProjectData()`.

Chức năng:

- nếu có `excelVars` format `Cylinder` mà chưa có device type `Cylinder`, tự đảm bảo type này tồn tại
- nếu có `project.unitConfig` legacy hoặc `excelVars` format `Unit Station`, tự đảm bảo tồn tại Struct Data type `Unit Station`
- nếu có `excelVars` với format tùy chỉnh khác, có thể auto-create Struct Data type tương ứng từ `signalAddresses`

Điều này có nghĩa:

- import dữ liệu có thể làm thay đổi `project.devices`
- không nên sửa flow này một cách cục bộ mà bỏ qua migration/sync trong `store.js`

## 9. Import CSV hiện tại

### 9.1 Modal import

`showExcelImportModal()` hiện hỗ trợ 3 loại import:

1. `Unit Station`
2. `Cylinder CSV`
3. `Struct Data`

UI có radio `name="ei-import-type"` để chọn loại import.

### 9.2 Import `Cylinder CSV`

- parse qua `eiParseCylinderCSV()`
- lưu vào `project.excelVars`
- mỗi entry có `format: 'Cylinder'`
- có canonical mapping cho `cyl_*`
- validate địa chỉ bằng `EI_KV_ADDR_RE`

### 9.3 Import `Unit Station`

- parse qua `eiParseUnitCSV()`
- ưu tiên đọc theo header name nếu file có header
- fallback về schema cũ nếu không có header
- lưu vào `project.unitConfig`

Các cột hiện được hỗ trợ bao gồm:

- `UnitName`
- `UnitIndex`
- `OriginBase`
- `AutoBase`
- `OriginFlag`
- `AutoFlag`
- `ManualFlag`
- `ErrorFlag`
- `Start`
- `Stop`
- `Reset`
- `EStop`
- `HomeDone`

### 9.4 Import `Struct Data`

- parse qua `eiParseStructCSV(rows, structTypeName)`
- map cột theo thứ tự `signals[]` của Struct Data type đã chọn trong `project.devices`
- lưu vào `project.excelVars`

### 9.5 Special case: Struct Data = `Unit Station`

Nếu import qua `Struct Data` và chọn đúng struct type `Unit Station` thì hệ thống sẽ:

1. lưu row vào `project.excelVars`
2. không sync/mirror sang `project.unitConfig`
3. codegen đọc lại `project.excelVars` để dựng `ctx.unit`

Tên field trong HBS phải dùng đúng `name` của signal trong Struct Data:

- signal `EStop` → `{{unit.EStop}}`
- signal `AutoFlag` → `{{unit.AutoFlag}}`
- signal `ManualFlag` → `{{unit.ManualFlag}}`
- signal `TEST` → `{{unit.TEST}}`

Không tự tạo alias kiểu `unit.eStop`, `unit.flagAuto`, `unit.flagManual`, hoặc `unit.flagTEST`. Nếu template dùng tên cũ thì output sẽ rỗng.

## 10. Code generation hiện tại

### 10.1 Target đang hiển thị trong modal

Trong `showGenerateCodeModal()`, select `#cg-target` hiện chỉ có:

- `unit-config`
- `runtime-plan`

Nếu cần khôi phục legacy target khác, phải sửa trực tiếp `modal.js` thay vì dựa vào tài liệu cũ.

### 10.2 Unit Config mode

Khi target là `unit-config`:

- ẩn Base MR input
- ẩn Unit/Diagram selector kiểu legacy
- hiện JSON files panel
- hiện Template Manager

### 10.3 Nguồn config hiệu lực

`modal.js` dùng helper `cgUCGetEffectiveConfig(selectedUnitId)`.

Thứ tự fallback hiện tại:

1. `UC_UNIT_CONFIG` nếu user load file JSON
2. synthetic config build từ `project.excelVars` có `format === 'Unit Station'`
3. fallback legacy từ `project.unitConfig` nếu chưa có Unit Station trong `excelVars`

Trong `unit-config.js`, `ucBuildSyntheticConfig(selectedUnitId)` dùng `project.excelVars` để tạo config tối thiểu cho codegen, nhưng `ctx.unit` được dựng từ signal `name` trong Struct Data `Unit Station`, không từ `unit.flags`/`unit.io`.

Điều này giúp generate chạy dù:

- chưa load file `infeed-unit.json`
- project chưa có `project.units`
- dữ liệu Unit Station chỉ mới được import qua Struct Data

### 10.4 Unit selector fallback

`cgUCBuildUnitSelector()` trong `modal.js` hiện:

- ưu tiên render unit từ `project.units`
- nếu `project.units` rỗng thì fallback sang label của `project.excelVars` có `format === 'Unit Station'`
- fallback cuối mới là key của `project.unitConfig` legacy

### 10.5 Unit template context từ Struct Data

Khi có `project.excelVars` format `Unit Station`, `cgUCBuildContext()` dựng `ctx.unit` theo signal `name` của Struct Data đã chọn.

Quy tắc:

- chỉ expose field được import trong Struct Data
- giữ nguyên chữ hoa/thường của signal name
- không tự sinh/default `unit.flags` hoặc `unit.io`
- không tạo alias camelCase hoặc `flag*`

Ví dụ nếu Struct Data `Unit Station` có signal:

- `EStop`
- `AutoFlag`
- `ManualFlag`
- `TEST`

thì template dùng:

```hbs
{{unit.EStop}}
{{unit.AutoFlag}}
{{unit.ManualFlag}}
{{unit.TEST}}
```

Không dùng:

```hbs
{{unit.eStop}}
{{unit.flagAuto}}
{{unit.flagManual}}
{{unit.flagTEST}}
```

Nếu template dùng tên không tồn tại trong Struct Data thì output sẽ rỗng.

### 10.6 Device Library JSON và command metadata

Unit Config codegen có thể dùng file Device Library JSON để mô tả command của từng loại thiết bị. File mẫu hiện có:

- `config/Devices.json`

Ví dụ cấu trúc cho Cylinder:

```json
{
  "deviceId": "cylinder",
  "name": "Cylinder",
  "version": "1.0.0",
  "commands": {
    "extend": {
      "actionLabel": "Cylinder Extend",
      "driveSignal": "CoilA",
      "complete": {
        "sensor": "LSH",
        "sensorLabel": "Cylinder High Limit"
      }
    },
    "retract": {
      "actionLabel": "Cylinder Retract",
      "driveSignal": "CoilB",
      "complete": {
        "sensor": "LSL",
        "sensorLabel": "Cylinder Low Limit"
      }
    }
  }
}
```

Quy tắc quan trọng:

- `driveSignal` và `complete.sensor` phải là đúng `name` của signal trong Struct Data tương ứng.
- Với Cylinder Struct Data chuẩn hiện tại:
  - `driveSignal: "CoilA"` hoàn tất bằng `complete.sensor: "LSH"`
  - `driveSignal: "CoilB"` hoàn tất bằng `complete.sensor: "LSL"`
- User có thể sửa các giá trị này để khớp Struct Data riêng, ví dụ thiết bị khác có signal command/complete khác.
- `commands` là object map theo command name (`extend`, `retract`, ...). Khi cần mở rộng output template theo số lượng command, có thể enrich context và dùng `{{#each commands}}` trong `.hbs`.

`step-body.hbs` không tự suy luận sensor từ tên cũ `_SNS` nữa. Logic completion hiện tại là:

```hbs
LD   {{pad addr}}; {{{actionLabel}}}
AND  {{pad complete}}; {{{completeLabel}}}
OUT  {{pad cmpAddr}}; {{{actionLabel}}} Cmp
```

`complete` được resolve từ `commands[*].complete.sensor` theo `driveSignal` của action. Ví dụ action `CY1.CoilA` dùng command có `driveSignal = "CoilA"`, sau đó lấy `complete.sensor = "LSH"` để tra địa chỉ `CY1.LSH` trong imported Struct Data.

DisSns (`DisSnsH` / `DisSnsL`) không còn nằm trong logic hoàn tất step của `auto/origin`. Nếu cần bypass sensor, chỉ dùng ở logic khác như error timer output, không đưa vào `step-body.hbs`.

### 10.7 Generic device output rendering

Unit Config output hiện dùng luồng modular qua `main-output.hbs` thay vì hard-code từng loại device trong template.

`main-output.hbs` phải dispatch bằng helper:

```hbs
;<h1>OUTPUT SECTION (AUTO/MANUAL)
{{#each devices}}
{{{renderDeviceOutput this ../unit}}}
{{/each}}
```

Không thêm lại các nhánh hard-code kiểu:

```hbs
{{#if (eq kind "cylinder")}}
{{> device_cylinder}}
{{else if (eq kind "servo")}}
{{> device_servo}}
{{/if}}
```

Quy tắc resolve output partial:

1. Mỗi device trong `tplCtx.devices` có metadata chuẩn hóa:
   - `kind`
   - `templateKey`
   - `partialName`
   - `outputPartial`
   - `usesGenericPartial`
   - `renderWarning`
   - `unit`
2. `templateKey` mặc định lấy từ `device.templateKey`, sau đó fallback về `kind`.
3. Partial được resolve theo tên `device_<templateKey>`.
4. Core partial mặc định:
   - `device_cylinder`
   - `device_servo`
   - `device_motor`
   - `device_generic`
5. Nếu không tìm thấy partial riêng cho kind mới, codegen dùng `device_generic` và ghi warning.
6. `devicesByKind` được thêm vào template context để các template có thể group theo loại device.
7. `cylinders` và legacy `output.hbs` vẫn được giữ để tương thích, nhưng `output.hbs` chỉ phục vụ luồng cylinder cũ.

Với device mới, có hai cách hỗ trợ output:

- Cách nhanh: device có `outputAddr` thì `device_generic` sẽ emit output tối thiểu:

```il
LD   <unit.flagAuto>; Auto
ANB  <unit.flagError>; Error
OUT  <outputAddr>; <label>_Output
```

- Cách đầy đủ: tạo/upload custom partial theo quy ước `device_<kind>.hbs`, ví dụ:
  - file upload: `device_valve.hbs`
  - device data: `kind: "valve"` hoặc `templateKey: "valve"`
  - partial runtime: `device_valve`

Trong device partial, dùng `unit.` trực tiếp vì `renderDeviceOutput` truyền `unit` vào context của partial. Không dùng `../unit.` trong `src/templates/devices/*.hbs`.

Nếu sửa template mặc định trong `src/templates/`, phải sync lại `src/js/codegen/templates-bundle.js` để offline/file:// mode chạy đúng.

### 10.8 Lỗi thường gặp khi generate Unit Config

#### Output template bị rỗng sau lệnh IL

Ví dụ:

```il
LD CR2002            ; Always ON
OUT             ; TEST mode
```

Nguyên nhân thường là template đang gọi sai field trong `ctx.unit`.

Với Struct Data `Unit Station`, codegen không tự đổi tên signal. Nếu Struct Data có signal `TEST`, template phải gọi:

```hbs
OUT {{pad unit.TEST}}; TEST mode
```

Không gọi:

```hbs
OUT {{pad unit.flagTEST}}; TEST mode
```

Tương tự:

- `EStop` → `{{unit.EStop}}`
- `AutoFlag` → `{{unit.AutoFlag}}`
- `ManualFlag` → `{{unit.ManualFlag}}`

#### Lỗi `Thiếu cấu hình Unit IO/Flags`

Thông báo này thuộc guard legacy trong `cgGenerateFromUnitConfig()`.

Luồng Struct Data mới không dùng `unit.flags` / `unit.io`, nên guard này chỉ được áp dụng khi chưa có `project.excelVars` format `Unit Station`. Nếu lỗi này xuất hiện, cần kiểm tra:

1. CSV đã import bằng mode `Struct Data` chưa
2. Struct type đã chọn đúng `Unit Station` chưa
3. `project.excelVars` có entry `format === 'Unit Station'` chưa
4. Template đang dùng đúng signal name gốc chưa

Nếu đã import Unit Station qua Struct Data mà vẫn gặp lỗi này, kiểm tra `cgUCGetEffectiveConfig()` và `ucGetUnitStationVars()` trong `unit-config.js` / `modal.js`.

### 10.9 Template health

Preview/copy/download ở Unit Config mode bị chặn nếu template library invalid.

Phải kiểm tra qua `template-manager.js` và các `.hbs` nếu preview bị block.

### 10.10 Runtime Plan target

`runtime-plan` dùng để debug pipeline runtime, không phải output IL production.

## 11. Template system

### 11.1 Bundled templates

Template mặc định nằm ở:

- `src/templates/*.hbs`
- `src/templates/devices/*.hbs`

Và được nhúng vào `src/js/codegen/templates-bundle.js`.

### 11.2 Dynamic overrides

`template-manager.js` cho phép upload các file `.hbs` và override bằng `localStorage`.

Các tên template Unit Config đang được hỗ trợ:

- `error.hbs`
- `manual.hbs`
- `origin.hbs`
- `auto.hbs`
- `main-output.hbs`
- `output.hbs`
- `step-body.hbs`
- `cylinder.hbs`
- `servo.hbs`
- `motor.hbs`
- `generic.hbs`
- custom device partial theo format `device_<kind>.hbs` (ví dụ `device_valve.hbs`)

Legacy keys vẫn còn:

- `kv_main.hbs`
- `kv_step.hbs`
- `st_main.hbs`

### 11.3 Nguyên tắc sửa template

- nếu thay đổi format nội dung IL, ưu tiên sửa `.hbs`
- chỉ sửa JS generator khi cần thay đổi context, planner, validation, lookup, hoặc helper

## 12. Các file nên kiểm tra trước khi sửa tính năng

### 12.1 Nếu lỗi import / global vars

- `src/js/editor/excel-import.js`
- `src/js/editor/vars.js`
- `src/js/core/store.js`

### 12.2 Nếu lỗi flow / sequence / step order

- `src/js/codegen/sequence.js`
- `src/js/core/graph-utils.js`
- dữ liệu diagram trong `project.diagrams` và `loadDiagramData()`

### 12.3 Nếu lỗi Unit Config generate

- `src/js/codegen/modal.js`
- `src/js/codegen/unit-config.js`
- `src/js/codegen/template-manager.js`
- `src/templates/*.hbs`

### 12.4 Nếu lỗi runtime debug

- `src/js/codegen/runtime-metadata.js`
- `src/js/codegen/runtime-resolver.js`
- `src/js/codegen/runtime-planner.js`
- `src/js/codegen/output-binding-planner.js`
- `src/js/codegen/runtime-debug.js`

## 13. Nguyên tắc sửa code trong dự án này

- Dùng Vanilla JS, không thêm framework.
- Ưu tiên sửa đúng module sở hữu hành vi.
- Không thêm global mới bừa bãi ngoài `constants.js` nếu không cần.
- Không dựa vào tài liệu cũ khi hành vi thực tế đã khác.
- Với bug import/unit/global vars, phải kiểm tra cả ba nơi: import path, persistence path, render path.
- Với bug codegen, phải xác định đúng nhánh: modal selection, effective config, template health, generator.
- Khi một hành vi có nhiều nguồn dữ liệu, phải ghi rõ ưu tiên và fallback thay vì vá tại UI.

## 14. Các lưu ý dễ nhầm

- `GLOBAL VARIABLES` không phải sidebar tab `vars`.
- `VARIABLE TABLE` không phải nơi hiển thị project-level imported data.
- `getVars()` không bao gồm `project.unitConfig`.
- `Unit Station` import có thể đi vào `project.unitConfig` trực tiếp hoặc đi qua `project.excelVars` rồi sync.
- Một số tài liệu cũ nói modal có nhiều target PLC legacy; UI hiện tại không còn hiển thị như vậy.
- `project.units` có thể rỗng nhưng Unit Config generate vẫn phải chạy được nhờ fallback.

## 15. Tài liệu liên quan

- `docs/gencode.md`
  - mô tả sâu về engine Unit Config đời cũ và nguyên lý generate

- `docs/excel-driven-config-plan.md`
  - ghi lại ý tưởng thiết kế import Excel và data pipeline

- `docs/codegen-runtime-handoff.md`
  - tài liệu handoff cho runtime/codegen path

Khi cập nhật các tài liệu này, hãy đồng bộ với hành vi hiện tại trong `src/` thay vì copy nguyên trạng từ tài liệu cũ.
