"""Loaded before API tests: prohibit real network except the dedicated test database."""
import socket
import pytest

@pytest.fixture(autouse=True)
def block_external_network(monkeypatch):
    original = socket.socket.connect
    def guarded(sock, address):
        if sock.family == socket.AF_UNIX:
            if not str(address).startswith('/tmp/prlist-ops-pg/'):
                raise AssertionError('Only isolated PostgreSQL socket is permitted')
        elif not (isinstance(address, tuple) and address[0] in ('127.0.0.1', '::1') and address[1] == 55432):
            raise AssertionError('External network blocked in operations QA')
        return original(sock,address)
    monkeypatch.setattr(socket.socket,'connect',guarded)
