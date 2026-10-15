"""same_origin_only: refuses anything not marked same-origin by the browser."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.realpath(__file__))))
import helpers


class _Req:
    def __init__(self, h): self.headers = h


async def _ok(request):
    return "ran"


def _call(headers):
    return asyncio.run(helpers.same_origin_only(_ok)(_Req(headers)))


def test_guard():
    assert _call({"Sec-Fetch-Site": "same-origin"}) == "ran"
    for h in ({}, {"Sec-Fetch-Site": "cross-site"}, {"Sec-Fetch-Site": "same-site"}, {"Sec-Fetch-Site": "none"}):
        assert _call(h).status == 403


if __name__ == "__main__":
    test_guard(); print("ok")
