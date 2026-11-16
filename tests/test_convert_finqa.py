import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "convert_finqa.py"
SPEC = importlib.util.spec_from_file_location("convert_finqa", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FinQAConverterTests(unittest.TestCase):
    def test_converts_official_shape_to_runner_envelope(self):
        record = {
            "id": "demo-1",
            "pre_text": ["Revenue increased."],
            "post_text": ["The company reported growth."],
            "table": [["Year", "Revenue"], ["2023", "100"]],
            "qa": {
                "question": "What was revenue in 2023?",
                "answer": "100",
                "program": "table_sum(100)",
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "test.json"
            output = Path(tmp) / "snapshot.json"
            source.write_text(json.dumps([record]), encoding="utf-8")
            rows = MODULE.convert(str(source), str(output), 1, "test", "abc123")
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(row["source_dataset"]["license"], "MIT")
            self.assertEqual(row["source_dataset"]["revision"], "abc123")
            self.assertEqual(row["gold_reference"]["gold_program"], "table_sum(100)")
            self.assertIn("Revenue", row["model_input"]["context"][1]["text"])
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))[0]["sample_id"], row["sample_id"])


if __name__ == "__main__":
    unittest.main()
