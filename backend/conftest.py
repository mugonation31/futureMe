"""
Root conftest for pytest - ensures backend directory is on sys.path
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
