import os
import traceback
from typing import Any, List

# JS directory for this node pack
WEB_DIRECTORY = os.path.join(os.path.dirname(__file__), "web", "js")

# Try to import ComfyUI's folder_paths helper (for LoRA listing)
try:
    import folder_paths
except Exception:
    folder_paths = None
    print("[My Easy Prompts] Warning: could not import folder_paths")


# -------------------------------------------------------------------------
# 1) My Easy Prompt node
# -------------------------------------------------------------------------
class MyEasyPromptNode:
    """
    My Easy Prompt node:
    - Lets you create multiple toggleable prompt snippets in the UI
    - JS side manages all the rows and builds a single joined string.
    - Python just outputs the final string as prompt.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # This widget is the "hidden aggregator" that JS writes into.
                "prompt": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                    },
                ),
                # Visible delimiter widget (default ", ")
                "delimiter": (
                    "STRING",
                    {
                        "default": ", ",
                        "multiline": False,
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build"
    CATEGORY = "utils/text"
    DESCRIPTION = "Combine multiple toggleable prompt snippets into one prompt string."

    def build(self, prompt: str, delimiter: str):
        # JS already builds `prompt` using current delimiter and toggle states.
        # Here we just pass it through.
        return (prompt,)


# -------------------------------------------------------------------------
# 2) My Easy Prompt List node
# -------------------------------------------------------------------------
class MyEasyPromptListNode:
    """
    My Easy Prompt List node:
    - Lets you create multiple toggleable prompt snippets in the UI
    - JS side manages all the rows and builds a single joined string.
    - Python just outputs the final string as prompt_list.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # This widget is the "hidden aggregator" that JS writes into.
                "prompt_list": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                    },
                ),
                # Visible delimiter widget (default ", ")
                "delimiter": (
                    "STRING",
                    {
                        "default": ", ",
                        "multiline": False,
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt_list",)
    FUNCTION = "build"
    CATEGORY = "utils/text"
    DESCRIPTION = "Combine multiple toggleable prompt snippets into one prompt string."

    def build(self, prompt_list: str, delimiter: str):
        # JS already builds `prompt_list` using current delimiter and toggle states.
        # Here we just pass it through.
        return (prompt_list,)


# -------------------------------------------------------------------------
# 3) My Easy Prompt Concatenate node
# -------------------------------------------------------------------------
class AnyType(str):
    """Can be connected to any data types."""

    def __eq__(self, __value: object) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


ANY = AnyType("*")

# ---- Default prompt input types (same as original) --------------------------
DEFAULT_PROMPT_INPUT_TYPES = {
    "required": {
        "remove_duplicates": (
            "BOOLEAN",
            {"default": True},
        ),
        "whitespace_style": (
            ["keep", "space", "underscore"],
            {"default": "keep"},
        ),
    },
}


# ---- Helpers: flatten, string conversion, cleaning --------------------------
def flatten_list(input_list: list) -> list:
    output_list: List[Any] = []
    for item in input_list:
        if isinstance(item, list):
            output_list.extend(flatten_list(item))
        else:
            output_list.append(item)
    return output_list


def convert_prompt_to_string(prompt: Any) -> str:
    """
    Convert any supported prompt input to a string.
    Mirrors the original logic from easycivitai-xtnodes (fixed).
    """
    if isinstance(prompt, str):
        pass
    elif isinstance(prompt, list):
        prompt = ",".join(flatten_list(prompt))
    else:
        prompt = str(prompt)

    assert isinstance(prompt, str)

    # Replace newlines etc. with commas.
    for char in ["\n", "\r", "\f", "\v"]:
        prompt = prompt.replace(char, ",")

    # Tabs -> spaces
    prompt = prompt.replace("\t", " ")
    return prompt


def convert_prompt_to_clean_list(prompt: Any) -> list:
    prompt_str = convert_prompt_to_string(prompt)
    all_words = prompt_str.split(",")
    new_words = []
    for word in all_words:
        word = word.strip()
        if len(word) > 0:
            new_words.append(word)
    return new_words


def deduplicate_list(words: list) -> list:
    def get_clean_chars(word: str) -> str:
        # Allow letters, numbers, space, underscore
        allowed_chars = (
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _"
        )
        import re

        return re.sub(f"[^{re.escape(allowed_chars)}]", "", word)

    existing_words = set()
    new_words = []
    for word in words:
        clean_word = get_clean_chars(word)
        if clean_word not in existing_words:
            new_words.append(word)
            existing_words.add(clean_word)
    return new_words


def clean_prompt(
    prompt: Any,
    remove_duplicates: bool = True,
    whitespace_style: str = "space",
) -> str:
    words = convert_prompt_to_clean_list(prompt)
    if remove_duplicates:
        words = deduplicate_list(words)

    if whitespace_style == "underscore":
        words = [word.replace(" ", "_") for word in words]
    elif whitespace_style == "space":
        words = [word.replace("_", " ") for word in words]
    # "keep" -> no space/underscore conversion

    return ", ".join(words)


# ---- Dynamic optional inputs trick ------------------------------------------
class ContainsAnyDict(dict):
    """
    Dict that:
    - Pretends to contain any key (__contains__)
    - Actually returns a default spec for unknown keys (__missing__)
    So Comfy can ask for prompt_C, prompt_D, etc. without KeyError.
    """

    def __contains__(self, key):
        # Comfy sometimes checks membership – always say "yes"
        return True

    def __missing__(self, key):
        # For any unknown key (e.g., prompt_C, prompt_D...),
        # return default input spec: ANY type, no extra config.
        return (ANY,)


class MyEasyPromptConcatenate:
    """
    my_easy_prompt_Concatenate
    - Starts with prompt_A & prompt_B.
    - JS side dynamically adds prompt_C, prompt_D, ... when the last input is connected.
    - Backend accepts arbitrary prompt_* inputs via **kwargs and ContainsAnyDict.
    """

    @classmethod
    def INPUT_TYPES(cls):
        # Start with A & B explicitly; others will be dynamically added in JS.
        optional = ContainsAnyDict(
            {
                "prompt_A": (ANY,),
                "prompt_B": (ANY,),
            }
        )

        input_types = {
            "required": dict(DEFAULT_PROMPT_INPUT_TYPES["required"]),
            "optional": optional,
        }
        return input_types

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("result",)
    FUNCTION = "concatenate_prompt"
    CATEGORY = "utils/text"  # Menu path

    def concatenate_prompt(
        self,
        remove_duplicates: bool = True,
        whitespace_style: str = "keep",
        **kwargs,
    ):
        """
        All dynamic inputs (prompt_A, prompt_B, prompt_C, ...) arrive in **kwargs.
        We'll:
        1. Collect keys starting with "prompt_"
        2. Sort them by name (A, B, C, ...)
        3. Concatenate and clean.
        """
        # 1. Collect prompt_* values
        prompt_items = [
            (name, value)
            for name, value in kwargs.items()
            if name.startswith("prompt_") and value is not None
        ]

        # Sort by name so order is deterministic: prompt_A, prompt_B, ...
        prompt_items.sort(key=lambda x: x[0])

        # 2. Concatenate into single string
        raw_concat = ""
        for _, prompt in prompt_items:
            raw_concat += convert_prompt_to_string(prompt) + ", "

        # Remove trailing ", "
        if raw_concat.endswith(", "):
            raw_concat = raw_concat[:-2]

        # 3. Clean (dedupe, whitespace style, etc.)
        result = clean_prompt(
            raw_concat,
            remove_duplicates=remove_duplicates,
            whitespace_style=whitespace_style,
        )

        return {
            "result": (result,),
            "ui": {
                "text": [result],
            },
        }


# -------------------------------------------------------------------------
# 4) My Easy Lora Triggerwords node
# -------------------------------------------------------------------------
def list_lora_files():
    """
    Return only .safetensors files from all lora folders.
    No loading, no hashing, just filenames.
    """
    try:
        if folder_paths is None:
            return []

        # ComfyUI can have multiple lora dirs; get them all
        lora_dirs = folder_paths.get_folder_paths("loras")
        files = []

        for d in lora_dirs:
            if not os.path.isdir(d):
                continue
            for f in os.listdir(d):
                if f.lower().endswith(".safetensors"):
                    # Avoid duplicates if same name exists in multiple dirs
                    if f not in files:
                        files.append(f)

        return sorted(files)
    except Exception as e:
        print("[My Easy Lora Triggerwords] Error listing lora files:", e)
        traceback.print_exc()
        return []


class MyEasyLoraTriggerwordsNode:
    """
    My Easy Lora Triggerwords node:
    - Shows a dropdown of LoRA .safetensors from the loras folders
    - Lets you create multiple toggleable prompt snippets in the UI (handled by JS)
    - Python just outputs the final prompt string.
    """

    @classmethod
    def INPUT_TYPES(cls):
        lora_files = list_lora_files()
        if not lora_files:
            lora_files = ["<no .safetensors in lora folders>"]

        return {
            "required": {
                #  Lora dropdown at the TOP of the node
                "lora_file": (lora_files,),
                # This widget is the "hidden aggregator" that JS writes into.
                "prompt": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                    },
                ),
                # Visible delimiter widget (default ", ")
                "delimiter": (
                    "STRING",
                    {
                        "default": ", ",
                        "multiline": False,
                    },
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build"
    CATEGORY = "utils/text"
    DESCRIPTION = "Combine multiple toggleable prompt snippets into one prompt string."

    def build(self, lora_file, prompt, delimiter):
        """
        `lora_file` is currently just a selectable UI value (not used in output),
        so the node remains backward compatible and still only outputs `prompt`.
        """
        # JS already builds `prompt` using current delimiter and toggle states.
        # Here we just pass it through.
        return (prompt,)


# -------------------------------------------------------------------------
# Node registration (all 4 in a single pack)
# -------------------------------------------------------------------------
NODE_CLASS_MAPPINGS = {
    "My Easy Prompt": MyEasyPromptNode,
    "My Easy Prompt List": MyEasyPromptListNode,
    "my_easy_prompt_Concatenate": MyEasyPromptConcatenate,
    "My Easy Lora Triggerwords": MyEasyLoraTriggerwordsNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "My Easy Prompt": "My Easy Prompt",
    "My Easy Prompt List": "My Easy Prompt List",
    "my_easy_prompt_Concatenate": "My Easy Prompt Concatenate",
    "My Easy Lora Triggerwords": "My Easy Lora Triggerwords",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
