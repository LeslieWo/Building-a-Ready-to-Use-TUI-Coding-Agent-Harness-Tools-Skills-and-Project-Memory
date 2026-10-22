import unittest
from intervals import merge_intervals
class Tests(unittest.TestCase):
    def test_overlap(self): self.assertEqual(merge_intervals([[1,4],[2,6]]), [[1,6]])
    def test_touch(self): self.assertEqual(merge_intervals([[1,2],[2,3]]), [[1,3]])
