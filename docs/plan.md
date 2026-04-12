## Custom Template Library Plan

### Muc tieu

Mo rong Template Manager hien co thanh mot thu vien template tuy bien cho luong Unit Config, cho phep nguoi dung tu nap thu cong cac file `.hbs` de thay doi logic sinh code cua rieng ho.

### Quyet dinh da chot

- Template custom chi luu trong `localStorage`.
- Khong gan template custom vao project export/import o giai doan nay.
- `Flow chart/project` la artifact chinh de team cong tac.
- File `.hbs` chi chia se rieng khi can tai su dung dung cung mot logic code generation.
- Pham vi dot nay chi tap trung vao `Unit Config templates` va `device partials`.
- Khi template loi hoac thieu phan bat buoc thi phai chan generate, khong fallback im lang.

### Vi sao chon huong nay

- Nguoi dung da co the nap lai `.hbs` thu cong, nen template khong can di kem project de he thong con hoat dong.
- Team trao doi voi nhau chu yeu can flow chart de hieu va chinh quy trinh.
- Logic codegen la lop tuy bien rieng, khong phai ai mo project cung bat buoc phai dung.
- Giu template ngoai project giup tranh lam format project phinh ra va tranh conflict giua du lieu nghiep vu voi logic render code.
- Pham vi trien khai gon hon vi chi can tap trung vao upload, registry, validation va UX loi thay vi mo rong luon luong import/export project.

### Pham vi trien khai

1. Chuan hoa mot template registry trung tam cho cac file `.hbs` duoc ho tro.
2. Quan ly ro hai nhom: `section templates` va `device partials`.
3. Chuan hoa pipeline upload thu cong trong `template-manager.js`.
4. Nang cap UI Template Manager trong `modal.js` de hien thi trang thai `Bundled`, `Custom`, `Invalid`, `Missing`.
5. Chuan hoa render path trong `unit-config.js` de loi template duoc tra ra ro rang.
6. Chan preview, copy va download neu bo template hien tai invalid.
7. Cap nhat tai lieu de nguoi dung biet file nao duoc ho tro, quy uoc ten file, helper co san va cach nap thu cong.

### Khong bao gom trong dot nay

1. Export/import template custom theo project.
2. Ho tro KV/ST template trong cung scope.
3. Theo doi file `.hbs` ngoai he thong tu dong.
4. User-defined Handlebars helpers.
5. Remote template packs hoac template marketplace.

### Registry schema

Moi entry trong registry nen co cac field sau:

- `id`
- `scope`
- `category`
- `uploadName`
- `storageKey`
- `cacheKey`
- `partialName`
- `bundledSourceKey`
- `requiredMode`
- `requiredWhen`
- `description`
- `order`
- `legacyFallbackOf`
- `acceptAliases`

Quy uoc:

- `scope`: co dinh la `unit-config` trong dot nay.
- `category`: chi co `section` hoac `partial`.
- `uploadName`: ten file nguoi dung thuc su chon de upload.
- `storageKey`: key luu `localStorage`, nen on dinh theo registry id.
- `cacheKey`: chi ap dung cho section templates duoc compile vao `UC_TEMPLATE_CACHE`.
- `partialName`: ten dang ky voi Handlebars.
- `bundledSourceKey`: key nguon mac dinh trong bundle de reset.
- `requiredMode`: `required`, `optional`, hoac `legacy`.
- `requiredWhen`: rule xac dinh entry co bat buoc theo context hien tai hay khong.
- `legacyFallbackOf`: bieu dien ro fallback tuong thich.
- `acceptAliases`: chi dung cho migration/backward compatibility.

### Upload names v1

Do input file hien tai chi co `file.name`, version dau khong nen phu thuoc vao path thu muc. Ten file upload chuan nen la:

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

### Registry entries v1

- `uc.error` -> `section` -> upload `error.hbs` -> cache `error`
- `uc.manual` -> `section` -> upload `manual.hbs` -> cache `manual`
- `uc.origin` -> `section` -> upload `origin.hbs` -> cache `origin`
- `uc.auto` -> `section` -> upload `auto.hbs` -> cache `auto`
- `uc.mainOutput` -> `section` -> upload `main-output.hbs` -> cache `main-output`
- `uc.outputLegacy` -> `section` -> upload `output.hbs` -> cache `output` -> fallback only
- `uc.stepBody` -> `partial` -> upload `step-body.hbs` -> partial `step_body`
- `uc.deviceCylinder` -> `partial` -> upload `cylinder.hbs` -> partial `device_cylinder`
- `uc.deviceServo` -> `partial` -> upload `servo.hbs` -> partial `device_servo`
- `uc.deviceMotor` -> `partial` -> upload `motor.hbs` -> partial `device_motor`

### Acceptance criteria

1. Trong target `Unit Config JSON`, Template Manager phai hien thi day du registry entries theo 2 nhom `Sections` va `Device partials`, moi entry co trang thai `Bundled` hoac `Custom`.
2. Upload file co `file.name` khop `uploadName` va compile hop le thi entry tuong ung phai doi sang `Custom`, apply ngay vao preview, va con lai sau reload nho localStorage.
3. Upload file `.hbs` khong khop registry thi phai bi tu choi ro rang, khong ghi localStorage, khong doi template active.
4. Template loi cu phap Handlebars phai hien trang thai `Invalid`, hien loi trong UI, va chan preview, copy, download cho target `unit-config`.
5. Template compile duoc nhung render loi do sai field context cung phai bi chan generate, khong duoc fallback ngam sang JS generator.
6. Neu chi custom `cylinder.hbs`, partial `device_cylinder` phai duoc thay dung ma khong anh huong `device_servo` va `device_motor`.
7. Neu unit hien tai khong dung servo hoac motor thi viec thieu cac partial do khong duoc coi la loi.
8. Reset mot entry phai khoi phuc dung bundled source, xoa custom source cua entry do trong localStorage, cap nhat preview, va dua trang thai ve `Bundled`.
9. Boot voi localStorage cu theo dang `custom_tpl_<filename>` phai migrate duoc sang registry moi ma khong mat custom template hien co.
10. Strict validation chi ap dung cho target `unit-config`, khong duoc chan KV, ST hoac runtime-plan.
11. Tai lieu phai ghi ro danh sach `uploadName`, helper hien co, context chinh, va nguyen tac cong tac: project la artifact chinh, `.hbs` chi chia se rieng khi can dung cung logic.

### Cac file trong tam khi trien khai

- `src/js/codegen/template-manager.js`
- `src/js/codegen/modal.js`
- `src/js/codegen/unit-config.js`
- `src/js/codegen/templates-bundle.js`
- `src/templates/main-output.hbs`
- `src/templates/devices/cylinder.hbs`
- `docs/gencode.md`
- `docs/instruction.md`

### Ghi chu cong tac

- Muon chia se quy trinh: gui project hoac flow chart.
- Muon chia se cach sinh code: gui them bo `.hbs`.
- Khong can ep moi project phai mang theo template custom.