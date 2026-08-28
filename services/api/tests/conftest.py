import os

import psycopg
import pytest

TEST_URL = "postgresql://postgres:postgres@localhost:5432/connection_test"
ADMIN_URL = "postgresql://postgres:postgres@localhost:5432/postgres"


@pytest.fixture(scope="session")
def client():
    with psycopg.connect(ADMIN_URL, autocommit=True) as admin:
        admin.execute("DROP DATABASE IF EXISTS connection_test")
        admin.execute("CREATE DATABASE connection_test")
    os.environ["DATABASE_URL"] = TEST_URL

    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as c:   # startup: 마이그레이션 + 시드
        yield c
