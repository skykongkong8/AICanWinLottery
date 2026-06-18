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
    "from pydantic import BaseModel, Field, RootModel, conint",
    "from pydantic import BaseModel, Field, RootModel, conint, model_validator",
)
text = text.replace(
    "class LottoCombination(RootModel[list[LottoCombinationItem]]):\n    root: list[LottoCombinationItem] = Field(..., max_length=6, min_length=6)\n",
    "class LottoCombination(RootModel[list[LottoCombinationItem]]):\n    root: list[LottoCombinationItem] = Field(..., max_length=6, min_length=6)\n\n    @model_validator(mode='after')\n    def validate_ascending_unique(self):\n        numbers = [int(item.root) for item in self.root]\n        if numbers != sorted(set(numbers)):\n            raise ValueError('lotto combination must be unique and ascending')\n        return self\n",
)
text += '''

# Project helper generated from LottoCombination schema invariants.
def _lotto_numbers(value: LottoCombination) -> list[int]:
    return [int(item.root) for item in value.root]


def validate_lotto_combination(value: LottoCombination) -> LottoCombination:
    return LottoCombination.model_validate(value)
'''
OUT.write_text(text, encoding="utf-8")
print(f"wrote {OUT} from {OPENAPI}")
