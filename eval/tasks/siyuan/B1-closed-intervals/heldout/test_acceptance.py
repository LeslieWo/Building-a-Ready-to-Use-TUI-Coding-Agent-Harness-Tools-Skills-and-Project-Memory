import unittest, copy
from intervals import merge_intervals
class Tests(unittest.TestCase):
    def test_empty(self): self.assertEqual(merge_intervals([]), [])
    def test_chain(self): self.assertEqual(merge_intervals([[3,4],[1,2],[2,3]]), [[1,4]])
    def test_nested_and_points(self): self.assertEqual(merge_intervals([[2,2],[0,4],[4,4],[9,10]]), [[0,4],[9,10]])
    def test_no_mutation(self):
        values=[[5,7],[-2,0],[0,1]]; before=copy.deepcopy(values)
        self.assertEqual(merge_intervals(values), [[-2,1],[5,7]])
        self.assertEqual(values,before)
