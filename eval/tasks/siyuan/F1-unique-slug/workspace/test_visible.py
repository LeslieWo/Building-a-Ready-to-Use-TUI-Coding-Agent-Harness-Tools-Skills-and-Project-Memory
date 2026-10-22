import unittest
from slugs import unique_slug
class Tests(unittest.TestCase):
    def test_unused(self): self.assertEqual(unique_slug("Hello World",set()),"hello-world")
    def test_conflict(self): self.assertEqual(unique_slug("Hello",{"hello"}),"hello-2")
