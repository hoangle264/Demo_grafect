# 📋 KẾ HOẠCH: EXCEL-DRIVEN UNIT CONFIGURATION (v1)

> Tài liệu này mô tả kế hoạch triển khai pipeline Excel → project data → Code Engine  
> cho Grafcet Studio. Phiên bản 1 tập trung vào nhóm Cylinder và Unit Station.

---

## 1. TRIẾT LÝ THIẾT KẾ

| Nguyên tắc | Mô tả |
|:---|:---|
| **Excel là Master Data** | Quản lý 100% địa chỉ I/O, cờ trạng thái, lệnh điều khiển |
| **Variable Table là trung gian** | Lưu `project.excelVars` sau import để Engine truy xuất |
| **Unit Config JSON là "Khung xương"** | Chỉ giữ `originBaseAddr` / `autoBaseAddr`, không chứa devices[] |
| **Schema cột cố định** | Tuyệt đối không để engine tự đoán tên cột — tránh sinh sai mã PLC |
| **Backward compat** | Dự án cũ (JSON có `cylinders[]` / `devices[]`) vẫn chạy bình thường |

---

## 2. QUYẾT ĐỊNH ĐÃ CHỐT

| Vấn đề | Quyết định |
|:---|:---|
| Lưu dữ liệu Excel ở đâu? | `project.excelVars[]` — project-level, dùng chung cho toàn project |
| Danh sách devices[] sau import? | Tự động phát hiện từ `project.excelVars`, không cần khai báo thủ công |
| Lock/Error/DisSns signals? | Mở rộng device type Cylinder: thêm 6 signal mới (12 total) |
| Phạm vi v1? | Cylinder + Unit Station |
| Unit Station flags/IO? | Lưu vào `project.unitConfig` (không cần file JSON ngoài) |

---

## 3. CẤU TRÚC DỮ LIỆU

### 3.1 `project.excelVars` (mảng, project-level)

Cùng format với diagram `vars[]`, reuse toàn bộ pipeline `ucScanSignalsFromVars`.

```json
[
  {
    "label": "CY1",
    "format": "Cylinder",
    "signalAddresses": {
      "cyl_coilA":   "LR000",
      "cyl_coilB":   "LR001",
      "cyl_lsh":     "MR1000",
      "cyl_lsl":     "MR1001",
      "cyl_lockA":   "MR1200",
      "cyl_lockB":   "MR1201",
      "cyl_disSnsH": "MR1400",
      "cyl_disSnsL": "MR1401",
      "cyl_errA":    "MR1600",
      "cyl_errB":    "MR1601",
      "cyl_state":   "MR1500",
      "cyl_hmiMan":  "MR1700"
    }
  }
]
```

### 3.2 `project.unitConfig` (map keyed by unit label)

```json
{
  "Infeed": {
    "label":          "Infeed",
    "unitIndex":      0,
    "originBaseAddr": "@MR100",
    "autoBaseAddr":   "@MR300",
    "flags": {
      "flagOrigin":  "@MR000",
      "flagAuto":    "@MR001",
      "flagManual":  "@MR002",
      "flagError":   "@MR004",
      "flagHomed":   "@MR010"
    },
    "io": {
      "eStop":     "MR5000",
      "btnStart":  "MR5001",
      "btnReset":  "MR5003",
      "hmiStart":  "MR5010",
      "hmiStop":   "MR5011",
      "hmiManual": "MR5012",
      "outHomed":  "MR5020"
    }
  }
}
```

### 3.3 Device Type "Cylinder" — 12 Signals Cố Định

| Signal ID | Signal Name | I/O Type | Ánh xạ Excel |
|:---|:---|:---|:---|
| `cyl_coilA` | CoilA | Output | Col 10 — Coil A |
| `cyl_coilB` | CoilB | Output | Col 11 — Coil B |
| `cyl_lsh` | LSH | Input | Col 1 — LSH |
| `cyl_lsl` | LSL | Input | Col 2 — LSL |
| `cyl_lockA` | LockA | Var | Col 3 — Lock A |
| `cyl_lockB` | LockB | Var | Col 4 — Lock B |
| `cyl_disSnsH` | DisSnsH | Var | Col 5 — Dis SNS LSH |
| `cyl_disSnsL` | DisSnsL | Var | Col 6 — Dis SNS LSL |
| `cyl_errA` | ErrorA | Var | Col 8 — Error A |
| `cyl_errB` | ErrorB | Var | Col 9 — Error B |
| `cyl_state` | State | Var | Col 7 — State |
| `cyl_hmiMan` | HmiManBtn | Var | *(tự tính theo index nếu không có trong Excel)* |

---

## 4. SCHEMA CSV CỐ ĐỊNH

### 4.1 Nhóm Cylinder — `cylinders.csv`

```
Col 0  = ID          (tên thiết bị, ví dụ CY1)
Col 1  = LSH         (sensor đầu hành trình HIGH)
Col 2  = LSL         (sensor đầu hành trình LOW)
Col 3  = Lock A      (cờ khóa chiều A)
Col 4  = Lock B      (cờ khóa chiều B)
Col 5  = Dis SNS LSH (cờ bypass sensor LSH)
Col 6  = Dis SNS LSL (cờ bypass sensor LSL)
Col 7  = State       (cờ trạng thái manual)
Col 8  = Error A     (cờ lỗi chiều A)
Col 9  = Error B     (cờ lỗi chiều B)
Col 10 = Coil A      (output điều khiển chiều A)
Col 11 = Coil B      (output điều khiển chiều B)
```

### 4.2 Nhóm Unit Station — `unit-station.csv`

```
Col 0  = Unit Name   (khớp với project.units[].name)
Col 1  = Unit Index  (số nguyên, 0-based)
Col 2  = Origin Flag
Col 3  = Auto Flag
Col 4  = Manual Flag
Col 5  = Error Flag
Col 6  = Start       (input nút Start)
Col 7  = Stop        (input nút Stop)
Col 8  = Reset       (input nút Reset)
Col 9  = E-Stop      (input E-Stop)
Col 10 = Home Done   (output đã homed)
```

---

## 5. KẾ HOẠCH TRIỂN KHAI

### Phase 1 — Nền tảng dữ liệu

**Step 1** — `src/js/core/store.js`
- Thêm `excelVars: []` và `unitConfig: {}` vào object `project` mặc định
- Migration trong `loadProject()`: khởi tạo nếu thiếu

**Step 2** — `src/js/codegen/unit-config.js`
- Tạo hàm `ucEnsureCylinderDeviceType()`: nếu `project.devices` chưa có "Cylinder" đúng 12 signal → tự động tạo/bổ sung
- Gọi khi import Excel và khi `loadProject()`

---

### Phase 2 — Tích hợp Engine

**Step 3** — `cgUCBuildContext()` trong `unit-config.js`
- Prepend `project.excelVars` vào `allVarsGlobal`
- Loại bỏ diagram vars trùng `label` với excel vars (excel ưu tiên)

**Step 4** — `ucNormalizeDeviceList()` trong `unit-config.js`
- Khi `unitConfig.devices` và `unitConfig.cylinders` đều rỗng: scan `project.excelVars` → auto-build device list
- Format mapping: `"Cylinder"→"cylinder"`, `"StepMotor"→"servo"`, `"Motor"→"motor"`

**Step 5** — cylinder context builder trong `cgUCBuildContext()`
- Lấy admin addresses từ `varTableSignals` trước, fallback sang công thức index:
  - `lockDirA    = varTableSignals['LockA']   || adminAddrs.lockDirA`
  - `lockDirB    = varTableSignals['LockB']   || adminAddrs.lockDirB`
  - `errFlagDirA = varTableSignals['ErrorA']  || adminAddrs.errFlagDirA`
  - `errFlagDirB = varTableSignals['ErrorB']  || adminAddrs.errFlagDirB`
  - `hmiManBtn   = varTableSignals['HmiManBtn']|| adminAddrs.hmiManBtn`
  - `disSnsA     = varTableSignals['DisSnsH'] || ''`  ← **trường mới**
  - `disSnsB     = varTableSignals['DisSnsL'] || ''`  ← **trường mới**

---

### Phase 3 — Bypass Sensor Logic *(song song với Phase 2 sau Step 3)*

**Step 6** — post-pass trong `cgUCBuildContext()`
- Sau khi build cylinders: với mỗi computed step, tra `action → cylinder → disSnsA/B` → gán `step.disSns`

**Step 7** — Templates
- `src/templates/step-body.hbs`: thêm nhánh bypass sensor

```handlebars
LD   {{pad addr}}; {{{actionLabel}}}
{{#if disSns}}
AND  {{pad sensor}}; {{{sensorLabel}}}
OR   {{pad disSns}}; DisSns bypass
ANL
{{else}}
{{#if sensor}}
AND  {{pad sensor}}; {{{sensorLabel}}}
{{/if}}
{{/if}}
SET  {{pad cmpAddr}}; {{{actionLabel}}} Cmp
```

- `src/templates/devices/cylinder.hbs`: thêm `disSnsA/B` vào logic error timer
- Sync chuỗi tương ứng trong `src/js/codegen/templates-bundle.js`

---

### Phase 4 — Synthetic Unit Config *(depends on Phase 2)*

**Step 8** — `ucBuildSyntheticConfig(selectedUnitId)` trong `unit-config.js`
- Lấy config từ `project.unitConfig[unitName]`, trả về object `{ unit: {...}, devices: [] }` chuẩn
- Trong `cgUpdatePreview()` (`modal.js`): nếu `UC_UNIT_CONFIG === null` nhưng `project.unitConfig` có dữ liệu → dùng synthetic config

---

### Phase 5 — Excel Import Module

**Step 9** — Tạo `src/js/editor/excel-import.js` (file mới)

| Hàm | Mô tả |
|:---|:---|
| `excelParseCylinderCSV(csvText)` | Parse 12 cột cố định, bỏ header, trả về `[{label, signalAddresses}]` |
| `excelParseUnitStationCSV(csvText)` | Parse 11 cột cố định, trả về unit config object |
| `excelValidateAddresses(data)` | Validate regex KV: `/^@?(MR\|LR\|DM\|CR\|AR\|WR\|HR)\d+$/i`, phát hiện trùng |
| `excelImportToProject(cylData, stationData)` | Ghi vào `project.excelVars` + `project.unitConfig`, gọi `saveProject()` |

**Step 10** — UI import trong Variable Table (`src/js/editor/vars.js`)
- Thêm nút `📥 Excel` vào header Variable Table
- Sub-modal: 2 input file (Cylinders CSV + Unit Station CSV)
- Preview sau parse → nút "Xác nhận" → `excelImportToProject()`
- `project.excelVars` rows hiển thị với badge `[Excel]` (read-only)

---

### Phase 6 — Load Order *(parallel với Phase 5)*

**Step 11** — `src/index.html`
- Thêm `<script src="js/editor/excel-import.js">` sau `vars.js`, trước `unit-config.js`

---

## 6. DEPENDENCY MAP

```
Step 1 (store schema)
  └─→ Step 2 (device type)
        └─→ Step 9 (excel-import.js)
              └─→ Step 10 (UI)

Step 3 (merge excelVars)
  └─→ Step 4 (auto device list)
        └─→ Step 5 (admin addrs from varTable)
              └─→ Step 6 (disSns post-pass)
                    └─→ Step 7 (templates)
              └─→ Step 8 (synthetic config)

Step 11 (index.html) — parallel với Step 9
```

---

## 7. FILE CẦN THAY ĐỔI

| File | Loại | Thay đổi |
|:---|:---|:---|
| `src/js/core/store.js` | Sửa | Thêm `excelVars`, `unitConfig` vào project schema + migration |
| `src/js/codegen/unit-config.js` | Sửa | `cgUCBuildContext`, `ucNormalizeDeviceList`, `ucResolveCylinderAdminAddrs`, `ucEnsureCylinderDeviceType`, `ucBuildSyntheticConfig` |
| `src/js/codegen/modal.js` | Sửa | `cgUpdatePreview` dùng synthetic config khi không có JSON |
| `src/templates/step-body.hbs` | Sửa | Bypass sensor OR condition |
| `src/templates/devices/cylinder.hbs` | Sửa | Bypass sensor trong error timer |
| `src/js/codegen/templates-bundle.js` | Sửa | Sync với .hbs files |
| `src/js/editor/vars.js` | Sửa | Nút import + hiển thị excel vars |
| `src/index.html` | Sửa | Thêm script tag |
| `src/js/editor/excel-import.js` | **Tạo mới** | Toàn bộ parse/validate/import logic |

---

## 8. KIỂM TRA (VERIFICATION)

1. Import CSV 5 cylinder → Generate (không load JSON) → code dùng địa chỉ CoilA/B, LSH/LSL đúng từ Excel
2. Cylinder có `DisSnsH` → step_body sinh `LD sensor; OR disSns; ANL; SET cmpAddr`
3. Cylinder có `LockA` → output block sinh `ANB lockA` trước `SET CoilA`
4. Cylinder có `ErrorA` → error timer sinh `ONDL` dùng địa chỉ từ Excel (không dùng công thức `MR1600 + index*2`)
5. Import Unit Station CSV → Generate → flags/IO trong header comment khớp Excel
6. Import 50 cylinder rows → không có trùng địa chỉ + validation hiển thị đúng
7. Mở project cũ (có `cylinders[]` trong JSON) → vẫn generate đúng (backward compat)

---

## 9. GHI CHÚ & GIỚI HẠN v1

- **Scope ngoài v1**: Servo/StepMotor group, Manual Control group riêng biệt
- **Column schema bất biến**: header row bắt buộc đúng thứ tự — không dùng tên cột để tra cứu
- **"Cylinder" device type**: `ucEnsureCylinderDeviceType` chỉ bổ sung signal còn thiếu, không xóa signal cũ
- **Nhiều units**: `project.unitConfig` là map `{[unitLabel]: config}` — hỗ trợ đa unit ngay từ đầu
- **Undo import**: `excelImportToProject` backup `project.excelVars` cũ, rollback nếu validation fail
