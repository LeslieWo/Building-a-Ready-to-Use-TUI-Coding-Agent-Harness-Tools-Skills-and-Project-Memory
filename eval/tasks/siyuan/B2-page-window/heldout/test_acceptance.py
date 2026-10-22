import unittest
from paging import paginate
class Tests(unittest.TestCase):
    def test_partial(self): self.assertEqual(paginate([1,2,3],1,2),[3])
    def test_empty(self): self.assertEqual(paginate([],0,1),[])
    def test_past_end(self): self.assertEqual(paginate([1],4,2),[])
    def test_invalid(self):
        for page,size in [(-1,2),(0,0),(0,-1)]:
            with self.assertRaises(ValueError): paginate([1],page,size)
    def test_independence(self):
        original=[1,2]; result=paginate(original,0,1); result.append(9)
        self.assertEqual(original,[1,2]); self.assertEqual(result,[1,9])
