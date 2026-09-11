import unittest
from import_nbme import structural_reasons, clean_stem


class ReadinessRegressionTests(unittest.TestCase):
    stem = "A participant completes an experiment. Which of the following results is expected?"
    explanation = "The supplied explanation describes the relationship tested in this synthetic example."

    def reasons(self, options=None, answer="B", stem=None, figure=False):
        values = options or [("A", "First result"), ("B", "Second result"), ("C", "Third result")]
        return structural_reasons(stem or self.stem, [{"id":k,"text":v} for k,v in values], answer, self.explanation, figure)

    def test_numeric_single_character_options_are_preserved(self):
        self.assertEqual([], self.reasons([("A","1"),("B","2"),("C","4")]))

    def test_complete_unicode_symbols_are_not_latin_ocr_glyphs(self):
        self.assertEqual([], self.reasons([("A","α"),("B","β"),("C","γ")]))

    def test_missing_middle_option_blocks_answering(self):
        self.assertIn("nonconsecutive_options", self.reasons([("A","First"),("B","Second"),("D","Fourth")]))

    def test_missing_answer_is_not_guessed(self):
        self.assertIn("missing_answer",self.reasons(answer=None))

    def test_key_outside_options_blocks_answering(self):
        self.assertIn("answer_not_in_options",self.reasons(answer="F"))

    def test_duplicate_numeric_options_signal_lost_information(self):
        self.assertIn("duplicate_options",self.reasons([("A","1"),("B","1"),("C","4")]))

    def test_required_figure_needs_independent_approval(self):
        self.assertIn("figure_not_ready",self.reasons(figure=True))

    def test_damaged_age_is_never_corrected_by_inference(self):
        self.assertIn("critical_value_ocr",self.reasons(stem="A 2 G-year-old participant completes an experiment. Which result is expected?"))

    def test_flattened_direction_table_is_not_presented_as_valid_options(self):
        reasons=self.reasons([("A","T   I"),("B","I   T"),("C","T   T")])
        self.assertIn("option_ocr_artifacts",reasons)

    def test_multicolumn_layout_requires_review(self):
        reasons=self.reasons([("A","high      low"),("B","low      high"),("C","low      low")])
        self.assertIn("option_layout_requires_review",reasons)

    def test_header_cleanup_retains_original_narrative_words(self):
        narrative="A 35-year-old participant completes an experiment. Which result is expected?"
        cleaned,notes=clean_stem("Exam Section 1: Item 3 of 50. "+narrative)
        self.assertEqual(narrative,cleaned)
        self.assertTrue(notes)
        self.assertEqual((narrative,[]),clean_stem(narrative))


if __name__=="__main__": unittest.main()
