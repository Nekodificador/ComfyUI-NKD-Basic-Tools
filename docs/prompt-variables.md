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

## Saved variables

Colours, style fragments or test prompts you keep reaching for can live in a
library of your own instead of a socket. The library is shared by every workflow.

- `Saved` opens the library. `+ New` adds an entry, and if you had text selected
  in the prompt it becomes the value.
- Click a name to rename it. Letters in any language, numbers, `-` and `_` are
  kept, and spaces become `_`.
- Each line of a value is one item, so a palette or a set of test prompts behaves
  like a wired list: one prompt per line, or shift-click the chip to pick one at
  random.
- Type `@` to insert a saved variable alongside the wired ones, or use `Insert` in
  the library. Saved chips are purple.
- The node keeps its own copy of every saved variable it uses, so a shared
  workflow still runs for someone who doesn't have your library. Editing an entry
  from this node's panel updates this node. Other nodes keep their copy until you
  insert the variable again.

---

[← All 😺NKD Basic Tools nodes](../README.md)
