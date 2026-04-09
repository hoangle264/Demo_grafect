# Codegen Runtime Handoff

## Current Goal

Move the code generator from the legacy transition-driven step logic to an explicit runtime model.

Current implementation order:
1. Rewrite step lifecycle generation first.
2. Leave the legacy output section in place for now.
3. Only rewrite output aggregation after step runtime behavior is stable.

## What Is Already Implemented

### New runtime modules
- `src/js/codegen/runtime-resolver.js`
- `src/js/codegen/runtime-planner.js`
- `src/js/codegen/output-binding-planner.js`
- `src/js/codegen/runtime-metadata.js`
- `src/js/codegen/runtime-debug.js`

### New config sample
- `config/runtime-device-metadata.sample.json`

### UI support
Generate Code modal now includes:
- `Runtime Plan [debug]` target
- `Runtime Metadata` JSON file input

The debug path builds runtime plans from real diagrams and prefers explicit runtime metadata loaded from JSON.

## Current Runtime Model

### Key rules
- One step owns one `executeBitRef`.
- One step may have many actions/output bindings.
- Step completion is based on explicit feedback signals, not just outgoing transitions.
- Required feedback refs are aggregated with `AND` semantics.
- Physical outputs are still handled by the legacy output section for now.

### Current step pattern
The intended generated step logic is:

```text
LD   prev_done
AND  transition
SET  step_execute_bit

LD   step_execute_bit
AND  feedback_1
AND  feedback_2
SET  step_done_bit
```

## Current Generator Integration

`src/js/codegen/kv-generator.js` has already been updated so that step activation/completion prefers `StepRuntimePlan` data when available:
- activation uses `prevDoneRefs` and `transitionRef`
- completion uses `feedbackRefs`
- fallback to legacy transition logic remains in place

The output section has not been rewritten yet.

## Runtime Metadata

The preferred source for execute-to-feedback mapping is explicit JSON metadata.

Current sample file:
- `config/runtime-device-metadata.sample.json`

Supported examples in the sample:
- `Out_Up -> In_Up`
- `Up_SOL -> Up_SNS`
- `coilA -> lsh`

## Recommended Next Step

Validate the new step runtime behavior on a real project diagram.

Suggested order:
1. Load runtime metadata JSON in the modal.
2. Open `Runtime Plan [debug]` and inspect the built `StepRuntimePlan` objects.
3. Compare generated step activation/completion logic against expected actuator/feedback behavior.
4. Fix metadata mapping issues before rewriting the output section.

## Important Constraint

Do not touch output aggregation next unless the step runtime layer is confirmed correct on real diagrams. The output rewrite depends on reliable `executeBitRef` and `feedbackRefs` coming from the step planner.
