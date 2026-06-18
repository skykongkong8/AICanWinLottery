from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OPENAPI = ROOT / "packages" / "shared" / "openapi.json"
OUT = Path(__file__).resolve().parents[1] / "src" / "lotto_agent" / "schemas_generated.py"
OUT.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(
    [
        "datamodel-codegen",
        "--input",
        str(OPENAPI),
        "--input-file-type",
        "openapi",
        "--output-model-type",
        "pydantic_v2.BaseModel",
        "--output",
        str(OUT),
    ],
    check=True,
)
text = OUT.read_text(encoding="utf-8")
text = text.replace(
    next((line for line in text.splitlines() if line.startswith("#   timestamp:")), "#   timestamp: normalized"),
    "#   timestamp: normalized",
)

# The ascending/unique invariant cannot be expressed in JSON Schema, so it is injected into the
# generated Pydantic model here. Injection is anchored to exact substrings of datamodel-codegen's
# output. Historically these were silent `.replace()` calls: if the output drifted the invariant
# simply vanished with no signal. Now a missing anchor raises, turning silent drift into a build
# failure (so the maintainer updates the anchor + invariant deliberately).
IMPORT_ANCHOR = "from pydantic import BaseModel, Field, RootModel, conint"
CLASS_ANCHOR = (
    "class LottoCombination(RootModel[list[LottoCombinationItem]]):\n"
    "    root: list[LottoCombinationItem] = Field(..., max_length=6, min_length=6)\n"
)
VALIDATOR = (
    "\n    @model_validator(mode='after')\n"
    "    def validate_ascending_unique(self):\n"
    "        numbers = [int(item.root) for item in self.root]\n"
    "        if numbers != sorted(set(numbers)):\n"
    "            raise ValueError('lotto combination must be unique and ascending')\n"
    "        return self\n"
)


def require_anchor(anchor: str, label: str) -> None:
    if anchor not in text:
        raise SystemExit(
            f"generate_models.py: codegen anchor for {label} not found — the OpenAPI schema or "
            "datamodel-codegen output changed, so the lotto-combination ascending/unique invariant "
            "would silently NOT be injected. Update the anchor (and the injected validator) to match "
            f"the new output instead of letting it no-op.\nExpected to find:\n{anchor!r}"
        )


require_anchor(IMPORT_ANCHOR, "pydantic import line")
require_anchor(CLASS_ANCHOR, "LottoCombination class body")

text = text.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + ", model_validator")
text = text.replace(CLASS_ANCHOR, CLASS_ANCHOR + VALIDATOR)
text += '''

# Project helper generated from LottoCombination schema invariants.
def _lotto_numbers(value: LottoCombination) -> list[int]:
    return [int(item.root) for item in value.root]


def validate_lotto_combination(value: LottoCombination) -> LottoCombination:
    return LottoCombination.model_validate(value)
'''
OUT.write_text(text, encoding="utf-8")
print(f"wrote {OUT} from {OPENAPI}")
