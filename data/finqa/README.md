# FinQA official test snapshot

This directory contains the 100-sample FinQA snapshot used by the real
FinanceBench-compatible evaluation path.

The snapshot is derived from the public FinQA repository at the pinned commit
`0f16e2867befa6840783e58be38c9efb9229d742` and is distributed under the MIT
license. The conversion keeps the official answer and calculation program in
`gold_reference`. The runner sends only `model_input` to the model.

Use `manifest.json` to verify the source revision, sample count and SHA256
digest before running an evaluation.

Validate the snapshot from the repository root with:

```bash
python x_models/id_x_009/scripts/validate_finqa_snapshot.py
```
