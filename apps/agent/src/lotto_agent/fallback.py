def fallback_for(numbers: list[int], tags: list[str], lucky: list[int]) -> tuple[str, str]:
    lucky_text = f" It preserves your lucky number(s): {', '.join(map(str, lucky))}." if lucky else ""
    return (
        f"This entertainment-only pick ({'-'.join(map(str, numbers))}) uses deterministic pattern narration without claiming better odds.{lucky_text}",
        f"Tags: {', '.join(tags) if tags else 'personalized pick'}."
    )
