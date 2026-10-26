# slave

Vibe coding without the kaboom factor.

## Setup

1. Install slave: `npm i -g @calamity-inc/slave`
2. Create a profile, e.g.:
  - `slave --create-profile luna openai gpt-6-luna --set-default`
  - `slave --create-profile haiku anthropic claude-haiku-5-5 --set-default`

## Usage

In any directory:
```
slave [options] [--] How do I use the 'slave' command?
```

You can also pipe text in:
```
cat yap.txt | slave Summarize this text
```

Options:
- `-c`, `--cont`, `--continue` — add your previous invocation to the context of this one
- `-a`, `--amend` — retry the previous invocation, using the context from before it
- `-w`, `--web` — allow the model to search the web
- `-n`, `--no-fs`, `--nofs` — disable filesystem access
- `-s`, `--sandbox` — allow the model to use a docker container
- `-p`, `--profile` `<name>` — use the specified profile

Single-character flags can be combined, so `slave -cw prompt` is equivalent to `slave -c -w prompt`.

Subcommands:
- `--create-profile <name> <provider> <model> [--set-default]` — create a profile
	- `provider` can be `openai`, `anthropic`, or an OpenAI-compatible base URL like `http://127.0.0.1:1234/v1` for [LM Studio](https://lmstudio.ai/developers).
- `--update-profile <name> <provider> <model> [--set-default]` — update a profile
- `--set-default <profile name>` — set default profile
- `--list-profiles` — list all profiles
- `--delete-profile <name>` — delete a profile
- `--update-api-key <provider>` — update an API Key
- `--logs` — get info about logs
- `--skills` — get info about skills

## Security

The model can't run commands on your system; it only gets limited access to your filesystem:
- Restricted to the working directory and its subdirectories.
- Can't read the `.git` folder, `.env` files, or any files excluded by `.slaveignore`. Although the model will still be able to know of their existence.
- Files that are `.gitignore`d can't be written to.

However, these restrictions are only as good as your practices; you should:
- Only run `slave` in Git-tracked folders and be sure that anything you don't want to lose is committed or at least staged so you can always revert any changes made by the model.
- Review changes to your code before running anything, including tests.
