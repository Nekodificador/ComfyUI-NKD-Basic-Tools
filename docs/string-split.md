# 😺NKD String Split

<img src="img/NKDStringSplit.png" alt="😺NKD String Split" align="left" width="30%">

Turns one block of text into a batch. It splits the text into a list of strings
and downstream nodes run once per item, so a list of prompts becomes N
generations with no extra wiring.

- Common delimiters plus a custom one.
- Whitespace trimming and empty-piece skipping.
- Optional removal of list numbering (`1.`, `2)`, `-`), for lists an LLM wrote.

The node shows the resulting list on itself, with partial execution so you can
iterate instantly.

<br clear="left">

---

[← All 😺NKD Basic Tools nodes](../README.md)
