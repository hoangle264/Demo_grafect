"use strict";

// ═══════════════════════════════════════════════════════════════════════════════
//  TEMPLATES BUNDLE — nhúng tất cả .hbs vào JS để chạy offline (file://)
//
//  File này được tạo tự động. Khi muốn thay đổi template:
//    1. Sửa file .hbs tương ứng trong src/templates/
//    2. Cập nhật chuỗi tương ứng trong file này
//
//  Được tải TRƯỚC unit-config.js trong index.html.
//  Khi load xong, gọi ucInjectBundledTemplates() để nạp vào Handlebars.
// ═══════════════════════════════════════════════════════════════════════════════

const UC_TEMPLATE_BUNDLE = {

  // ── src/templates/error.hbs ──────────────────────────────────────────────
  error: `;<h1/>Error
{{#if unit.eStop}}
LD   {{pad unit.eStop}}; {{{unit.label}}}  estop
ZRES {{{unit.flagOrigin}}} {{{unit.flagsResetEnd}}} ; Origin
{{/if}}
{{#if originBase}}
LD   {{pad unit.flagManual}}; Manual
ZRES {{{originBase}}} {{{unit.flagsResetEnd}}} ; CY1 Down
{{/if}}
{{#if unit.errorDMAddr}}
LD   CR2002           ; Always ON
{{#each cylinders}}
{{#if errFlagDirA}}
MOV  {{pad errFlagDirA}}{{{../unit.errorDMAddr}}}         ; Error_{{{label}}}_{{{dirAName}}}  {{{../unit.label}}}_Error
{{/if}}
{{/each}}
LD>  {{pad unit.errorDMAddr}}#0             ; {{{unit.label}}}_Error
{{else}}
{{#each cylinders}}
{{#if errFlagDirA}}
{{#if @first}}LD   {{else}}OR   {{/if}}{{pad errFlagDirA}}; Error_{{{label}}}_{{{dirAName}}}
{{/if}}
{{#if errFlagDirB}}
OR   {{pad errFlagDirB}}; Error_{{{label}}}_{{{dirBName}}}
{{/if}}
{{/each}}
{{/if}}
SET  {{pad unit.flagError}}; Error
LD   {{pad unit.flagError}}; Error
SET  {{pad unit.flagErrStop}}; Operation Error Stop
LD   {{pad unit.flagErrStop}}; Operation Error Stop
{{#if unit.btnReset}}
AND  {{pad unit.btnReset}}; btnReset
{{/if}}
{{#if unit.flagResetPulse}}
DIFU {{pad unit.flagResetPulse}}; Reset Error
LDP  {{pad unit.flagResetPulse}}; Reset Error
ZRES {{{unit.flagError}}} {{{unit.flagResetEnd}}} ; Error  Reset Error
{{/if}}
`,

  // ── src/templates/manual.hbs ─────────────────────────────────────────────
  manual: `;<h1/>Manual
LDB  {{pad unit.flagAuto}}; Auto
{{#if unit.hmiManual}}
AND  {{pad unit.hmiManual}}; Hmi_{{{unit.label}}}_Manual
{{/if}}
OR   {{pad unit.flagManual}}; Manual
{{#if unit.eStop}}
ANB  {{pad unit.eStop}}; {{{unit.label}}}  estop
{{/if}}
ANB  {{pad unit.flagManPEnd}}; Manual P end
OUT  {{pad unit.flagManual}}; Manual
{{#if hasCylinders}}
LD   {{pad unit.flagManual}}; Manual
{{#if isSingleCylinder}}
ANP  {{pad cylinders.[0].hmiManBtn}}; Hmi_man _{{{cylinders.[0].label}}}
ALT  {{pad cylinders.[0].sysManFlag}}; sys_man_{{{cylinders.[0].label}}}
{{else}}
{{#each cylinders}}
{{#if altStackInst}}
{{{altStackInst}}}
{{/if}}
ANP  {{pad hmiManBtn}}; Hmi_man _{{{label}}}
ALT  {{pad sysManFlag}}; sys_man_{{{label}}}
{{/each}}
{{/if}}
{{/if}}
{{#if hasCysWithOut}}
LDB  {{pad unit.flagManual}}; Manual
{{#if cysWithOutMultiple}}
MPS
{{#each cysWithOut}}
{{#if outDirA}}
ANP  {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
SET  {{pad sysManFlag}}; sys_man_{{{label}}}
{{/if}}
{{{stackBeforeDirB}}}
{{#if outDirB}}
ANP  {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
RES  {{pad sysManFlag}}; sys_man_{{{label}}}
{{/if}}
{{#if stackAfterDirB}}
{{{stackAfterDirB}}}
{{/if}}
{{/each}}
{{else}}
{{#with cysWithOut.[0]}}
{{#if outDirA}}
ANP  {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
SET  {{pad sysManFlag}}; sys_man_{{{label}}}
{{/if}}
{{#if outDirB}}
ANP  {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
RES  {{pad sysManFlag}}; sys_man_{{{label}}}
{{/if}}
{{/with}}
{{/if}}
{{/if}}
LDB  {{pad unit.flagManual}}; Manual
{{#if showManBtnZres}}
ZRES {{{unit.hmiManBtnBase}}} {{{unit.hmiManBtnEnd}}} ; Hmi_man _{{{firstCyLabel}}}
{{/if}}
LD   {{pad unit.flagAuto}}; Auto
DIFU {{pad unit.flagManPEnd}}; Manual P end
`,

  // ── src/templates/origin.hbs ─────────────────────────────────────────────
  origin: `;<h1/>Origin
{{#if unit.btnStart}}
LDP  {{pad unit.btnStart}}; btnStart
{{/if}}
{{#if unit.hmiStart}}
ORP  {{pad unit.hmiStart}}; Hmi_{{{unit.label}}}_start
{{/if}}
ANB  {{pad unit.flagManual}}; Manual
ANB  {{pad unit.flagHomed}}; Homed
OR   {{pad unit.flagOrigin}}; Origin
AND  {{pad unit.flagError}}; Error
{{#if unit.eStop}}
ANB  {{pad unit.eStop}}; {{{unit.label}}}  estop
{{/if}}
{{#if unit.hmiStop}}
ANB  {{pad unit.hmiStop}}; Hmi {{{unit.label}}} _stop
{{/if}}
OUT  {{pad unit.flagOrigin}}; Origin
{{#if hasOriginSteps}}
{{#each originSteps}}
;{{{actionLabel}}}
{{#if isFirst}}
LD   {{pad ../unit.flagOrigin}}; Origin
ANB  {{pad ../unit.flagHomed}}; Homed
ANB  {{pad ../unit.flagError}}; Error
{{else}}
LD   {{pad prevCmpAddr}}; {{{prevActionLabel}}} Cmp
ANB  {{pad ../unit.flagError}}; Error
{{/if}}
{{#if extraCondition}}
{{{extraCondition}}}
{{/if}}
SET  {{pad addr}}; {{{actionLabel}}}
{{> step_body}}
{{/each}}
LD   {{pad lastOriginStep.cmpAddr}}; {{{lastOriginStep.actionLabel}}} Cmp
SET  {{pad unit.flagHomed}}; Homed
LD   {{pad unit.flagHomed}}; Homed
{{#if unit.outHomed}}
OUT  {{pad unit.outHomed}}; {{{unit.label}}}  homed
{{/if}}
{{/if}}
`,

  // ── src/templates/auto.hbs ───────────────────────────────────────────────
  auto: `;<h1/>Auto
{{#if unit.btnStart}}
LDP  {{pad unit.btnStart}}; btnStart
{{/if}}
{{#if unit.hmiStart}}
ORP  {{pad unit.hmiStart}}; Hmi_{{{unit.label}}}_start
{{/if}}
AND  {{pad unit.flagHomed}}; Homed
OR   {{pad unit.flagAuto}}; Auto
AND  {{pad unit.flagError}}; Error
{{#if unit.eStop}}
ANB  {{pad unit.eStop}}; {{{unit.label}}}  estop
{{/if}}
{{#if unit.hmiStop}}
ANB  {{pad unit.hmiStop}}; Hmi infeed _stop
{{/if}}
OUT  {{pad unit.flagAuto}}; Auto
{{#if unit.autoTriggerAddr}}
LD   {{pad unit.flagHomed}}; Homed
AND  {{pad unit.flagAuto}}; Auto
ANB  {{pad unit.flagManual}}; Manual
ANB  {{pad unit.flagError}}; Error
SET  {{pad unit.autoTriggerAddr}}
{{/if}}
{{#each stationFlows}}
;<h1/>{{{label}}}
{{#each steps}}
;{{{actionLabel}}}
{{#if isFirst}}
LD   {{pad ../../unit.flagAuto}}; Auto
AND  {{pad ../../unit.flagHomed}}; Homed
ANB  {{pad ../../unit.flagError}}; Error
SET  {{pad addr}}; {{{actionLabel}}}
{{else}}
LD   {{pad prevCmpAddr}}; {{{prevActionLabel}}} Cmp
ANB  {{pad ../../unit.flagError}}; Error
{{#if extraCondition}}
{{{extraCondition}}}
{{/if}}
SET  {{pad addr}}; {{{actionLabel}}}
{{/if}}
{{> step_body}}
{{/each}}
LD   {{pad lastStep.cmpAddr}}; {{{lastStep.actionLabel}}} Cmp
DIFU {{pad endPulseAddr}}; Sequence 1 End
LD   {{pad endPulseAddr}}; Sequence 1 End
ZRES {{{steps.[0].addr}}} {{{resetEndAddr}}} ; {{{lastStep.actionLabel}}} Cmp
{{/each}}
`,

  // ── src/templates/output.hbs ─────────────────────────────────────────────
  output: `;<h1/>Output
{{#each cylinders}}
{{#if hasOutput}}
;{{{label}}}
{{#if hasDirAOutput}}
LD   {{pad ../unit.flagAuto}}; Auto
AND  {{pad stepDirA.addr}}; {{{label}}} {{{dirAName}}}
ANB  {{pad stepDirA.cmpAddr}}; {{{label}}} {{{dirAName}}} Cmp
LD   {{pad ../unit.flagManual}}; Manual
ANP  {{pad sysManFlag}}; sys_man_{{{label}}}
ORL
{{#if lockDirA}}
ANB  {{pad lockDirA}}; {{{../unit.label}}}_{{{label}}}_Lock_{{{dirAName}}}
{{/if}}
SET  {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
{{#if outDirB}}
CON
RES  {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
{{/if}}
{{/if}}
{{#if hasDirBOutput}}
LD   {{pad ../unit.flagAuto}}; Auto
{{#if singleStepDirB}}
LD   {{pad enrichedStepsDirB.[0].addr}}; {{{enrichedStepsDirB.[0].sLabel}}}
ANB  {{pad enrichedStepsDirB.[0].cmpAddr}}; {{{enrichedStepsDirB.[0].sLabel}}} Cmp
{{else}}
{{#each enrichedStepsDirB}}
LD   {{pad addr}}; {{{sLabel}}}
ANB  {{pad cmpAddr}}; {{{sLabel}}} Cmp
{{#if needsORL}}
ORL
{{/if}}
{{/each}}
{{/if}}
ANL
LD   {{pad ../unit.flagManual}}; Manual
ANF  {{pad sysManFlag}}; sys_man_{{{label}}}
ORL
{{#if lockDirB}}
ANB  {{pad lockDirB}}; {{{../unit.label}}}_{{{label}}}_Lock {{{dirBName}}}
{{/if}}
{{#if outDirA}}
RES  {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
CON
{{/if}}
SET  {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
{{/if}}
{{#if errTimerDirA}}
LD   {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
ANB  {{pad sensorDirA}}; in_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
ANB  {{pad ../unit.flagManual}}; Manual
ANB  {{pad ../unit.flagErrStop}}; Operation Error Stop
ONDL #{{{errorTimeout}}} {{{errFlagDirA}}}   ; Error_{{{label}}}_{{{dirAName}}}
{{/if}}
{{#if errTimerDirB}}
LD   {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
ANB  {{pad sensorDirB}}; in_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
ANB  {{pad ../unit.flagManual}}; Manual
ANB  {{pad ../unit.flagErrStop}}; Operation Error Stop
ONDL #{{{errorTimeout}}} {{{errFlagDirB}}}   ; Error_{{{label}}}_{{{dirBName}}}
{{/if}}
{{/if}}
{{/each}}
`,

  // ── src/templates/main-output.hbs ────────────────────────────────────────
  'main-output': `;<h1>OUTPUT SECTION (AUTO/MANUAL)
{{#each devices}}
{{#if (eq kind "cylinder")}}
{{> device_cylinder }}
{{else if (eq kind "servo")}}
{{> device_servo }}
{{else if (eq kind "motor")}}
{{> device_motor }}
{{else}}
; WARNING: Unknown device kind for {{{label}}}
{{/if}}
{{/each}}
`,

};

// ── Partials bundle ───────────────────────────────────────────────────────────

const UC_PARTIAL_BUNDLE = {

  // ── src/templates/step-body.hbs ──────────────────────────────────────────
  //  *** SỬA ĐÂY để thay đổi format completion của mỗi step ***
  //  Mặc định: LD addr → AND sensor → SET cmpAddr (latch bit)
  step_body: `LD   {{pad addr}}; {{{actionLabel}}}
{{#if sensor}}
AND  {{pad sensor}}; {{{sensorLabel}}}
{{/if}}
SET  {{pad cmpAddr}}; {{{actionLabel}}} Cmp
`,

  // ── src/templates/devices/cylinder.hbs ───────────────────────────────────
  device_cylinder: `{{#if hasOutput}}
;{{{label}}}
{{#if hasDirAOutput}}
LD   {{pad ../unit.flagAuto}}; Auto
AND  {{pad stepDirA.addr}}; {{{label}}} {{{dirAName}}}
ANB  {{pad stepDirA.cmpAddr}}; {{{label}}} {{{dirAName}}} Cmp
LD   {{pad ../unit.flagManual}}; Manual
ANP  {{pad sysManFlag}}; sys_man_{{{label}}}
ORL
{{#if lockDirA}}
ANB  {{pad lockDirA}}; {{{../unit.label}}}_{{{label}}}_Lock_{{{dirAName}}}
{{/if}}
SET  {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
{{#if outDirB}}
CON
RES  {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
{{/if}}
{{/if}}
{{#if hasDirBOutput}}
LD   {{pad ../unit.flagAuto}}; Auto
{{#if singleStepDirB}}
LD   {{pad enrichedStepsDirB.[0].addr}}; {{{enrichedStepsDirB.[0].sLabel}}}
ANB  {{pad enrichedStepsDirB.[0].cmpAddr}}; {{{enrichedStepsDirB.[0].sLabel}}} Cmp
{{else}}
{{#each enrichedStepsDirB}}
LD   {{pad addr}}; {{{sLabel}}}
ANB  {{pad cmpAddr}}; {{{sLabel}}} Cmp
{{#if needsORL}}
ORL
{{/if}}
{{/each}}
{{/if}}
ANL
LD   {{pad ../unit.flagManual}}; Manual
ANF  {{pad sysManFlag}}; sys_man_{{{label}}}
ORL
{{#if lockDirB}}
ANB  {{pad lockDirB}}; {{{../unit.label}}}_{{{label}}}_Lock {{{dirBName}}}
{{/if}}
{{#if outDirA}}
RES  {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
CON
{{/if}}
SET  {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
{{/if}}
{{#if errTimerDirA}}
LD   {{pad outDirA}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirAName}}}
ANB  {{pad sensorDirA}}; FB_{{{../unit.label}}}_{{{label}}}_{{{fbDirAName}}}
ANB  {{pad ../unit.flagManual}}; Manual
ANB  {{pad ../unit.flagErrStop}}; Operation Error Stop
ONDL #{{{errorTimeout}}} {{{errFlagDirA}}}   ; Error_{{{label}}}_{{{dirAName}}}_to_{{{fbDirAName}}}
{{/if}}
{{#if errTimerDirB}}
LD   {{pad outDirB}}; Out_{{{../unit.label}}}_{{{label}}}_{{{dirBName}}}
ANB  {{pad sensorDirB}}; FB_{{{../unit.label}}}_{{{label}}}_{{{fbDirBName}}}
ANB  {{pad ../unit.flagManual}}; Manual
ANB  {{pad ../unit.flagErrStop}}; Operation Error Stop
ONDL #{{{errorTimeout}}} {{{errFlagDirB}}}   ; Error_{{{label}}}_{{{dirBName}}}_to_{{{fbDirBName}}}
{{/if}}
{{/if}}
`,

  // ── src/templates/devices/motor.hbs ──────────────────────────────────────
  device_motor: `;{{{label}}}
{{#if fwdAddr}}
LD   {{pad ../unit.flagAuto}}; Auto
{{#if fwdStepAddr}}
AND  {{pad fwdStepAddr}}; {{{label}}} Fwd step active
{{/if}}
{{#if revAddr}}
ANB  {{pad revAddr}}; {{{label}}} Rev (interlock)
{{/if}}
{{#if overloadAddr}}
ANB  {{pad overloadAddr}}; {{{label}}} Overload/Fault
{{/if}}
LD   {{pad ../unit.flagManual}}; Manual
{{#if fwdManFlag}}
ANP  {{pad fwdManFlag}}; sys_man_{{{label}}}_Fwd
{{/if}}
ORL
OUT  {{pad fwdAddr}}; {{{label}}}_Fwd
{{/if}}
{{#if revAddr}}
LD   {{pad ../unit.flagAuto}}; Auto
{{#if revStepAddr}}
AND  {{pad revStepAddr}}; {{{label}}} Rev step active
{{/if}}
{{#if fwdAddr}}
ANB  {{pad fwdAddr}}; {{{label}}} Fwd (interlock)
{{/if}}
{{#if overloadAddr}}
ANB  {{pad overloadAddr}}; {{{label}}} Overload/Fault
{{/if}}
LD   {{pad ../unit.flagManual}}; Manual
{{#if revManFlag}}
ANP  {{pad revManFlag}}; sys_man_{{{label}}}_Rev
{{/if}}
ORL
OUT  {{pad revAddr}}; {{{label}}}_Rev
{{/if}}
{{#if overloadAddr}}
LD   {{pad overloadAddr}}; {{{label}}} Overload/Fault
SET  {{pad ../unit.flagError}}; Error (motor fault)
{{/if}}
`,

  // ── src/templates/devices/servo.hbs ──────────────────────────────────────
  device_servo: `;{{{label}}}
{{#if enableAddr}}
LD   {{pad ../unit.flagAuto}}; Auto
ANB  {{pad ../unit.flagError}}; Error
OUT  {{pad enableAddr}}; {{{label}}}_Enable
{{/if}}
{{#if targetPos}}
LD   {{pad ../unit.flagAuto}}; Auto
ANB  {{pad ../unit.flagError}}; Error
DMOV {{{targetPos}}} ; {{{label}}}_TargetPos
{{/if}}
{{#if velocityAddr}}
LD   {{pad ../unit.flagAuto}}; Auto
ANB  {{pad ../unit.flagError}}; Error
MOV  #100   {{pad velocityAddr}}; {{{label}}}_Velocity
{{/if}}
{{#if resetErrAddr}}
LD   {{pad ../unit.flagResetPulse}}; Reset Error pulse
OUT  {{pad resetErrAddr}}; {{{label}}}_ResetErr
{{/if}}
{{#if inPositionAddr}}
LD   {{pad enableAddr}}; {{{label}}}_Enable
AND  {{pad inPositionAddr}}; {{{label}}}_InPosition
{{/if}}
`,

};

// ─── Inject bundle vào Handlebars + UC_TEMPLATE_CACHE ────────────────────────
// Được gọi bởi unit-config.js SAU KHI UC_TEMPLATE_CACHE đã được khai báo.
// KHÔNG tự chạy ở đây vì UC_TEMPLATE_CACHE chưa tồn tại lúc này.
function ucInjectBundledTemplates() {
  if (typeof Handlebars === 'undefined') return;
  if (typeof UC_TEMPLATE_CACHE === 'undefined') return;
  // Đăng ký helpers trước khi compile (pad, eq, padStart2)
  if (!Handlebars.__ucHelpersRegistered) {
    Handlebars.registerHelper('pad', function(addr) {
      var s = addr != null ? String(addr) : '';
      while (s.length < 12) s += ' ';
      return new Handlebars.SafeString(s);
    });
    Handlebars.registerHelper('eq', function(a, b) { return a === b; });
    Handlebars.registerHelper('padStart2', function(n) {
      return String((n != null ? Number(n) : 0) + 1).padStart(2, '0');
    });
    Handlebars.__ucHelpersRegistered = true;
  }
  // Compile và cache các template chính
  Object.keys(UC_TEMPLATE_BUNDLE).forEach(function(name) {
    if (!UC_TEMPLATE_CACHE[name]) {
      UC_TEMPLATE_CACHE[name] = Handlebars.compile(UC_TEMPLATE_BUNDLE[name]);
    }
  });
  // Đăng ký partials
  Object.keys(UC_PARTIAL_BUNDLE).forEach(function(name) {
    Handlebars.registerPartial(name, UC_PARTIAL_BUNDLE[name]);
  });
}
