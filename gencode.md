# Grafcet Studio — Unit Config Code Generator

## Phiên bản

| Version | Mô tả |
|---|---|
| **v3** (hiện tại) | JSON tối giản + tự tính flags/IO theo quy ước; `devices[]`; `overrides` optional |
| v2 (vẫn hỗ trợ) | JSON đầy đủ với `cylinders[]`, `flags{}`, `io{}` bắt buộc |

---

## Kiến trúc tổng quan

Engine sinh IL code từ **2 nguồn kết hợp**:

| Nguồn | Nội dung |
|---|---|
| `unit-config.json` | Unit info + danh sách thiết bị tối giản (v3) hoặc đầy đủ (v2) |
| Canvas diagrams | Thứ tự step, action (SOL), sensor (SNS) — do người dùng vẽ trong Grafcet Studio |
| Variable Table | Địa chỉ vật lý **chính xác** cho _SOL và _SNS — **single source of truth** |

> **Nguyên tắc v3**: Canvas là nguồn duy nhất về thứ tự quy trình. Variable Table là nguồn duy nhất về địa chỉ I/O vật lý. JSON chỉ là khung xương (unit info + device list).

---

## Schema v3 (unit-config.json)

```json
{
  "unit": {
    "label": "Infeed",
    "unitIndex": 0,
    "originBaseAddr": "@MR100",
    "autoBaseAddr":   "@MR300",
    "autoEndPulseAddr": "@MR011",
    "overrides": {
      "io":    { },
      "flags": { }
    }
  },
  "devices": [
    { "kind": "cylinder", "id": "CY1", "index": 0 },
    { "kind": "cylinder", "id": "CY2", "index": 1 }
  ]
}
```

**Ghi chú:**
- `overrides.io` và `overrides.flags` là **optional** — bỏ trống nếu dùng giá trị mặc định.
- `devices[].index` là **optional** — nếu không có thì dùng vị trí trong mảng.
- Nếu `devices` không có thì **fallback** đọc `cylinders[]` kiểu v2.

---

## Schema v2 (vẫn được hỗ trợ)

```json
{
  "unit": {
    "label": "Infeed",
    "plcProfile": "kv-5500",
    "originBaseAddr": "@MR100",
    "autoBaseAddr":   "@MR300",
    "autoEndPulseAddr": "@MR011",
    "flags": { "flagOrigin":"@MR000", "flagAuto":"@MR001", ... },
    "io":    { "eStop":"MR103", "btnStart":"MR5000", ... }
  },
  "cylinders": [
    { "id":"CY1", "hmiManBtn":"MR1400", "sysManFlag":"MR1500",
      "lockDirA":"MR1200", "lockDirB":"MR1201",
      "errFlagDirA":"MR1600", "errFlagDirB":"MR1601", "errorTimeout":500 }
  ]
}
```

**Không còn** trường `flows[]` — thứ tự bước lấy từ canvas.

---

## Quy ước tự tính FLAGS (v3)

Nếu JSON không override (`overrides.flags`), engine dùng:

| Flag | Địa chỉ mặc định |
|---|---|
| `flagOrigin` | `@MR000` |
| `flagAuto` | `@MR001` |
| `flagManual` | `@MR002` |
| `flagManPEnd` | `@MR003` |
| `flagError` | `@MR004` |
| `flagErrStop` | `@MR005` |
| `flagResetPulse` | `@MR006` |
| `flagResetEnd` | `@MR006` |
| `flagHomed` | `@MR010` |

Hằng số cấu hình: `UC_DEFAULT_FLAGS` ở đầu file.

---

## Quy ước tự tính IO theo unitIndex (v3)

Công thức: `ioBase = UC_IO_BASE + unitIndex × UC_IO_STRIDE`

Mặc định: `UC_IO_BASE = 5000`, `UC_IO_STRIDE = 100`

| IO signal | Offset | Ví dụ (unit 0) |
|---|---|---|
| `eStop` | +0 | `MR5000` |
| `btnStart` | +1 | `MR5001` |
| `btnReset` | +3 | `MR5003` |
| `hmiStart` | +10 | `MR5010` |
| `hmiStop` | +11 | `MR5011` |
| `hmiManual` | +12 | `MR5012` |
| `outHomed` | +20 | `MR5020` |
| `errorDMAddr` | DM(ioBase) | chỉ khi `UC_IO_USE_DM=true` |

Override một phần trong `overrides.io` hoặc `unit.io` (v2).

---

## Quy ước tự tính Admin Addresses per cylinder (v3)

| Address | Công thức | Ví dụ CY1 (idx=0) | Ví dụ CY2 (idx=1) |
|---|---|---|---|
| `hmiManBtn` | `MR(UC_HMI_MAN_BASE + index)` | `MR1400` | `MR1401` |
| `sysManFlag` | `MR(UC_SYS_MAN_BASE + index)` | `MR1500` | `MR1501` |
| `lockDirA` | `MR(UC_LOCK_BASE + index×2)` | `MR1200` | `MR1202` |
| `lockDirB` | `MR(UC_LOCK_BASE + index×2 + 1)` | `MR1201` | `MR1203` |
| `errFlagDirA` | `MR(UC_ERR_BASE + index×2)` | `MR1600` | `MR1602` |
| `errFlagDirB` | `MR(UC_ERR_BASE + index×2 + 1)` | `MR1601` | `MR1603` |

Hằng số cấu hình: `UC_HMI_MAN_BASE`, `UC_SYS_MAN_BASE`, `UC_LOCK_BASE`, `UC_ERR_BASE`, `UC_ERR_TIMEOUT`.

Override: điền trực tiếp trong `devices[].hmiManBtn`, v.v.

---

## Quy ước Variable Table (bất biến, cả v2 và v3)

```
Output SOL : CY1.Up_SOL   = LR000      CY1.Down_SOL  = LR001
Sensor SNS : CY1.Up_SNS   = MR1000     CY1.Down_SNS  = MR1001
```

- `{CyId}.{Dir}_SOL` → output coil (phải khai báo trong Variable Table của diagram)
- `{CyId}.{Dir}_SNS` → sensor input
- Step **action** = `CY1.Down_SOL` (qualifier N)
- Transition **condition** = `CY1.Down_SNS`

**Quan trọng**: engine quét Variable Table qua `ucScanSignalsFromVars()` trước, sau đó fallback sang step.actions. Đây là bước ưu tiên tuyệt đối để lấy địa chỉ vật lý chính xác.

---

## Diagrams cần vẽ

| Diagram | Mode | Nội dung |
|---|---|---|
| Origin | `Origin` | Sequence trở về home (CY1 Down → CY2 Retract → Homed) |
| Station 1 | `Auto` | Sequence làm việc (CY2 Retract → CY1 Up → CY1 Down → CY2 Extend) |

Tên diagram `Mode` phải khớp (`origin` / `auto`, không phân biệt hoa thường) → engine filter theo `diag.mode`.

---

## Tính địa chỉ MR

```
step[i].addr    = baseNum + i×2        (VD: @MR100, @MR102, ...)
step[i].cmpAddr = baseNum + i×2 + 1    (VD: @MR101, @MR103, ...)

flagsResetEnd   = autoBaseNum + 115    (VD: 300+115 = @MR415)
```

Station dùng `autoBaseAddr` thay `originBaseAddr`. Nhiều station: `autoBaseNum + fi×32`.

---

## dirA / dirB Detection

```
dirA = hướng CHỈ xuất hiện trong Station  (hướng làm việc, VD: Up / Extend)
dirB = hướng xuất hiện trong Origin       (hướng hồi về,   VD: Down / Retract)
```

| Cylinder | dirA | dirB |
|---|---|---|
| CY1 (UpDown) | Up (LR000) | Down (LR001) |
| CY2 (ExtendRetract) | Extend (LR002) | Retract (LR003) |

**Edge case**: nếu cả hai hướng đều trong Origin (không có Station-only direction):
→ dirA = hướng thứ 2 trong originDirs, dirB = hướng thứ nhất.

**Warning**: nếu thiếu Origin diagram hoặc thiếu Station diagram → engine sinh cảnh báo trong output.

---

## Cấu trúc 5 section output

### `;<h1/>Error`
```
LD   MR5000          ; eStop → ZRES @MR000 @MR415
LD   @MR002          ; Manual → ZRES @MR100 @MR415
LD   CR2002
MOV  MR1600 DM5000   ; per cylinder errFlagDirA
LD>  DM5000 #0 → SET @MR004 → SET @MR005
AND MR5003 → DIFU @MR006 → ZRES @MR004 @MR006
```

### `;<h1/>Manual`
```
LDB @MR001 / AND hmiManual / OR @MR002 / ANB eStop / ANB @MR003 / OUT @MR002
```
**ALT block** (N cylinders):
```
MPS → [MRD, ANP hmiManBtn, ALT sysManFlag] × (N-2) → MPP → pair → last pair
```
**LDB block** (cylinders with outputs only):
```
MPS → [ANP outDirA, SET sysManFlag, MRD, ANP outDirB, RES sysManFlag, MRD] × (N-1)
    → ANP outDirA, SET, MPP, ANP outDirB, RES
```

### `;<h1/>Origin`
```
LDP btnStart / ORP hmiStart / ANB @MR002 / ANB @MR010 / OR @MR000 / AND @MR004
ANB eStop / ANB hmiStop / OUT @MR000

; Per step (từ canvas Origin diagram):
Step 0: LD @MR000, ANB @MR010, ANB @MR004, SET @MR100
        LD @MR100, AND MR1001, SET @MR101
Step N: LD prev.cmpAddr, ANB @MR004, [extraCond], SET step.addr
        LD step.addr, AND sensor, SET step.cmpAddr

LD lastStep.cmpAddr → SET @MR010 → OUT MR5020
```

### `;<h1/>Auto` + `;<h1/>Station N`
```
LDP btnStart / AND @MR010 / OR @MR001 / AND @MR004 / ANB eStop / OUT @MR001

; Per station (canvas Mode=Auto):
Step 0: LD @MR001, AND @MR010, ANB @MR004, SET @MR300
        LD @MR300, AND sensorOut, SET @MR301
...
LD lastStep.cmpAddr → DIFU @MR011 → ZRES @MR300 @MR315
```

### `;<h1/>Output`
```
; Per cylinder:
[dirA block]  LD @MR001 / AND stepDirA.addr / ANB stepDirA.cmpAddr
              LD @MR002 / ANP sysManFlag / ORL / ANB lockDirA
              SET outDirA / CON / RES outDirB

[dirB block]  LD @MR001
              LD step1.addr / ANB step1.cmpAddr        ; 1 hoặc nhiều steps
              [LD step2.addr / ANB step2.cmpAddr / ORL] × thêm
              ANL / LD @MR002 / ANF sysManFlag / ORL / ANB lockDirB
              RES outDirA / CON / SET outDirB

[Error timer] LD outDirA / ANB sensorDirA / ANB @MR002 / ANB @MR005
              ONDL #500 errFlagDirA   (và tương tự cho dirB)
```

---

## Acceptance Criteria (v3)

1. **Happy path**: Project có diagram Origin + Auto và Variable Table đúng quy ước → engine sinh Output đầy đủ cho từng cylinder.
2. **Thiếu diagram**: Nếu không có diagram Origin/Auto → output có comment `WARNING:` giải thích lý do, section tương ứng trống.
3. **Thiếu vars**: Nếu Variable Table không có `CY1.Up_SOL` → `WARNING: CY1 — không tìm thấy địa chỉ output`.
4. **Backward compat**: JSON v2 cũ có `cylinders[]` → engine vẫn chạy bình thường.
5. **Override**: User điền `overrides.io.eStop = "MR103"` → engine dùng `MR103` thay vì tự tính.

---

## Các hàm chính trong grafcet-codegen.js

### Resolver Functions (v3 mới)

| Hàm | Vai trò |
|---|---|
| `ucResolveUnitFlags(unitCfg)` | Tính flags hệ thống; ưu tiên overrides.flags > unit.flags > UC_DEFAULT_FLAGS |
| `ucResolveUnitIO(unitCfg)` | Tính IO hệ thống theo unitIndex; ưu tiên overrides.io > unit.io > computed |
| `ucResolveCylinderAdminAddrs(cylDef, devIndex)` | Tính hmiManBtn/sysManFlag/lock/err per cylinder theo index |
| `ucScanSignalsFromVars(unitDiagsVars, deviceId)` | Quét Variable Table → `{ "Up_SOL": "LR000", ... }` bằng dot-notation thủ công |
| `ucNormalizeDeviceList(unitConfig)` | Chuẩn hóa v2 cylinders[] / v3 devices[] → mảng thống nhất |
| `ucBuildWarnings(ctx)` | Tập hợp các warning nếu thiếu diagram / vars / signal address |

### Engine Functions (v2 + v3)

| Hàm | Vai trò |
|---|---|
| `cgGenerateFromUnitConfig(uc, _, profile)` | Entry point — gọi build + 5 section generators + warnings |
| `cgUCBuildContext(unitConfig)` | Đọc canvas diagrams, tính addresses, xác định dirA/dirB |
| `cgUCGenerateError(ctx)` | Sinh section Error |
| `cgUCGenerateManual(ctx)` | Sinh section Manual (MPS/MRD/MPP stacks) |
| `cgUCGenerateOrigin(ctx)` | Sinh section Origin từ `ctx.originSteps` |
| `cgUCGenerateAuto(ctx)` | Sinh Auto + Station sections từ `ctx.stationFlows` |
| `cgUCGenerateOutput(ctx)` | Sinh Output per cylinder (dirA/dirB/ONDL) |
| `buildComputedSteps(seqData, baseNum)` | (nội bộ) Map sequence → {addr, cmpAddr, sensor, actions} |
| `cgUCLoadFile(inputId, cb)` | Load JSON qua FileReader |

### Constants cấu hình (v3)

| Hằng số | Mặc định | Mô tả |
|---|---|---|
| `UC_DEFAULT_FLAGS` | object | Địa chỉ mặc định cho 9 flags hệ thống |
| `UC_IO_BASE` | `5000` | Địa chỉ IO đầu tiên (unit 0) |
| `UC_IO_STRIDE` | `100` | Bước nhảy giữa các unit |
| `UC_IO_USE_DM` | `false` | Dùng DM cho errorDMAddr |
| `UC_IO_OFFSETS` | object | Offset map (eStop=+0, btnStart=+1, ...) |
| `UC_HMI_MAN_BASE` | `1400` | Base cho hmiManBtn |
| `UC_SYS_MAN_BASE` | `1500` | Base cho sysManFlag |
| `UC_LOCK_BASE` | `1200` | Base cho lockDirA/B |
| `UC_ERR_BASE` | `1600` | Base cho errFlagDirA/B |
| `UC_ERR_TIMEOUT` | `500` | ms mặc định cho ONDL timer |

---

## Bug quan trọng đã fix (v2 → v3)

**`KV_ADDR_RE = /^[A-Z]{1,3}\d/`** nhầm `CY1.Down_SOL` là PLC address (vì `CY1` = 3 chữ + 1 chữ số).

→ **Fix v2**: mọi chỗ resolve dot-notation phải xử lý thủ công trước, không qua `cgResolveSignalInfo`.

→ **Fix v3**: `ucScanSignalsFromVars()` hoàn toàn bypass `cgResolveSignalInfo` và `KV_ADDR_RE`. Dùng dot-notation thủ công (`indexOf('.')`) để lookup trong Variable Table.

---

## UI

- Target `🟣 Unit Config JSON` trong `#cg-target` select
- File picker: **Unit Config JSON** (bắt buộc) + Cylinder Types (optional, không dùng)
- Ẩn base-MR input và diagram selector khi chọn unit-config mode
- Download file `.mnm`
- Status bar hiển thị schema version (v2/v3), unitIndex, số devices
