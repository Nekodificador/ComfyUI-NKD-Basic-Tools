# 😺NKD Prompt Variables

Builds a multiprompt with two nodes. Write your prompt and drop variable chips
into it; each chip is filled by whatever text arrives on its input socket.

- Sockets grow as you connect, renamed sockets rename their chips, and chips drag
  around the text.
- Wire a list into a variable, from [😺NKD String Split](string-split.md) for
  instance, and the prompt resolves once per item.
- Shift-click a chip, or use `Randomize All`, to make that variable pick a random
  item instead, seeded so it stays reproducible.

The node shows the resolved prompt(s) on itself.

https://github.com/user-attachments/assets/ce3f916a-3a41-4848-be44-9636dc7477bb

---

[← All 😺NKD Basic Tools nodes](../README.md)
