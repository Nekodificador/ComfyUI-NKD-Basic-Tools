"""same_origin_only: refuses anything not marked same-origin by the browser."""
import asyncio, glob, os, re, sys
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


# Routes that only read: a frame the graph already holds, the editor's own axis
# table, or the metadata of an id the server handed out itself. Everything else
# writes a file or sets a model going, so it must carry the decorator. A new
# route lands in the failing list by default, which is the point: the pack was
# flagged once over exactly this.
READ_ONLY = {
    "/nkd/colorwarp/source",
    "/nkd/merge/source",
    "/nkd/facerig/library",
    "/nkd/paint/get",
}
_ROUTE = re.compile(r'routes\.(?:get|post|put|delete|route)\(\s*(?:"\*",\s*)?"([^"]+)"')


def test_every_working_route_is_guarded():
    pack = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    missing = []
    for f in sorted(glob.glob(os.path.join(pack, "nkd_*.py"))):
        src = open(f, encoding="utf-8").read()
        lines = src.split("\n")
        for i, line in enumerate(lines):
            m = _ROUTE.search(line)
            if not m or m.group(1) in READ_ONLY:
                continue
            window = "\n".join(lines[i:i + 4])
            if "same_origin_only" in window:
                continue
            # A dispatcher that delegates is covered by the handler it calls.
            if "return await " in "\n".join(lines[i:i + 12]):
                continue
            missing.append(os.path.basename(f) + " " + m.group(1))
    assert not missing, "routes without same_origin_only: " + ", ".join(missing)


if __name__ == "__main__":
    test_guard()
    test_every_working_route_is_guarded()
    print("ok")
