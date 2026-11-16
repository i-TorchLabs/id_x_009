import unittest

from sqlalchemy import create_engine, inspect

from x_models.id_x_009.src.models.x_models import Base


class ModelSchemaTests(unittest.TestCase):
    def test_sample_result_table_is_created_in_isolated_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        tables = set(inspect(engine).get_table_names())
        self.assertIn("eval_sample_results", tables)
        columns = {item["name"] for item in inspect(engine).get_columns("eval_sample_results")}
        self.assertTrue({"task_id", "model_id", "sample_id", "score", "score_status"} <= columns)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
