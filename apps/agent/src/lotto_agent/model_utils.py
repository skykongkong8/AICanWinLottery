from .schemas_generated import LottoCombination, validate_lotto_combination


def numbers_from_combination(value: LottoCombination) -> list[int]:
    validate_lotto_combination(value)
    return [int(item.root) for item in value.root]
