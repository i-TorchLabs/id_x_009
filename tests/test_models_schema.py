import unittest

from sqlalchemy import create_engine, inspect

from x_models.id_x_009.src.models.x_models import Base


class ModelSchemaTests(unittest.TestCase):
    def test_sample_result_table_is_created_in_isolated_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        tables = set(inspect(engine).get_table_names())
        self.assertIn("eval_sample_results", tables)
        self.assertIn("models_info", tables)
        self.assertNotIn("models", tables)
        self.assertNotIn("model_info", tables)
        self.assertNotIn("model_price", tables)
        self.assertIn("dataset_samples", tables)
        columns = {item["name"] for item in inspect(engine).get_columns("eval_sample_results")}
        self.assertTrue({"task_id", "model_id", "sample_id", "score", "score_status"} <= columns)
        info_cols = {item["name"] for item in inspect(engine).get_columns("models_info")}
        self.assertTrue(
            {
                "name",
                "vendor",
                "series",
                "version",
                "base_url",
                "api_key",
                "model_name",
                "access_type",
                "backend",
                "input_price_per_1m",
                "output_price_per_1m",
            }
            <= info_cols
        )
        sample_cols = {item["name"] for item in inspect(engine).get_columns("dataset_samples")}
        self.assertTrue(
            {
                "dataset_id",
                "sample_id",
                "domain",
                "prompt",
                "expected_answer",
                "sort_order",
            }
            <= sample_cols
        )
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
