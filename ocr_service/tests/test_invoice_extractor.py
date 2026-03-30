from __future__ import annotations

import unittest

from ocr_service.invoice_extractor import NO_INVOICE_NUMBER, extract_invoice_number


class InvoiceExtractorTests(unittest.TestCase):
    def test_extracts_number_only_when_strict_label_exists(self) -> None:
        result = extract_invoice_number([
            "开票日期：2024-12-24",
            "发票号码: 12345678901234567890",
            "金额 25.00",
        ])

        self.assertEqual(result["invoice_number"], "12345678901234567890")
        self.assertTrue(result["has_invoice_number_label"])
        self.assertEqual(result["matched_invoice_number"], "12345678901234567890")

    def test_returns_no_invoice_number_when_only_generic_numbers_exist(self) -> None:
        result = extract_invoice_number([
            "4200059295202412236886392024-12-24",
            "商户消费",
            "20010724122301002",
            "79390450388",
        ])

        self.assertEqual(result["invoice_number"], NO_INVOICE_NUMBER)
        self.assertFalse(result["has_invoice_number_label"])
        self.assertEqual(result["matched_invoice_number"], "")
        self.assertGreaterEqual(len(result["all_number_tokens"]), 2)

    def test_extracts_number_when_label_and_number_are_split_across_lines(self) -> None:
        result = extract_invoice_number([
            "发票",
            "号码：",
            "123456789012",
        ])

        self.assertEqual(result["invoice_number"], "123456789012")
        self.assertTrue(result["has_invoice_number_label"])
        self.assertEqual(result["match_details"][0]["source"], "window_3_lines")


if __name__ == "__main__":
    unittest.main()
