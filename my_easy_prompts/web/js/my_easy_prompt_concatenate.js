// web/js/my_easy_prompt_concatenate.js
import { app } from "/scripts/app.js";
import { ComfyWidgets } from "/scripts/widgets.js";

const NODE_NAME = "my_easy_prompt_Concatenate";

app.registerExtension({
    name: "my_easy_prompt_Concatenate.DynamicInputsAndText",
    async beforeRegisterNodeDef(nodeType, nodeData, app_) {
        if (nodeData.name !== NODE_NAME) return;

        // ---------------- TEXT DISPLAY ----------------
        const originalOnExecuted = nodeType.prototype.onExecuted;

        nodeType.prototype.onExecuted = function (message) {
            originalOnExecuted?.apply(this, arguments);

            if (this.widgets) {
                const pos = this.widgets.findIndex((w) => w.name === "text");
                if (pos !== -1) {
                    for (let i = pos; i < this.widgets.length; i++) {
                        this.widgets[i].onRemove?.();
                    }
                    this.widgets.length = pos;
                }
            }

            if (message && Array.isArray(message.text)) {
                for (const list of message.text) {
                    const w = ComfyWidgets["STRING"](
                        this,
                        "text",
                        ["STRING", { multiline: true }],
                        app_
                    ).widget;
                    w.inputEl.readOnly = true;
                    w.inputEl.style.opacity = 0.6;
                    w.value = list;
                }
            }

            this.onResize?.(this.size);
        };

        // ---------------- DYNAMIC INPUTS: prompt_A, prompt_B, prompt_C, ... ----------------
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        const originalOnConnectionsChange = nodeType.prototype.onConnectionsChange;

        function getPromptInputIndices(node) {
            const res = [];
            if (!node.inputs) return res;
            for (let i = 0; i < node.inputs.length; i++) {
                const inp = node.inputs[i];
                if (inp && typeof inp.name === "string" && inp.name.startsWith("prompt_")) {
                    res.push(i);
                }
            }
            return res;
        }

        function isInputConnected(node, index) {
            if (!node.inputs || !node.inputs[index]) return false;
            return node.inputs[index].link != null;
        }

        function getNextPromptName(node) {
            const existing = new Set();
            if (node.inputs) {
                for (const inp of node.inputs) {
                    if (inp && typeof inp.name === "string") {
                        existing.add(inp.name);
                    }
                }
            }

            const base = "prompt_";
            const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

            for (let i = 0; i < letters.length; i++) {
                const name = base + letters[i];
                if (!existing.has(name)) return name;
            }

            for (let a = 0; a < letters.length; a++) {
                for (let b = 0; b < letters.length; b++) {
                    const name = base + letters[a] + letters[b];
                    if (!existing.has(name)) return name;
                }
            }

            let idx = 1;
            while (existing.has(base + idx)) idx++;
            return base + idx;
        }

        function updateDynamicPromptInputs(node) {
            if (!node.inputs || !node.inputs.length) return;

            let promptIndices = getPromptInputIndices(node);
            if (!promptIndices.length) return;

            let trailingUnconnected = 0;
            for (let i = promptIndices.length - 1; i >= 0; i--) {
                const idx = promptIndices[i];
                if (!isInputConnected(node, idx)) {
                    trailingUnconnected++;
                } else {
                    break;
                }
            }

            while (trailingUnconnected > 1) {
                promptIndices = getPromptInputIndices(node);
                const lastIndex = promptIndices[promptIndices.length - 1];
                const lastInput = node.inputs[lastIndex];
                if (lastInput && !isInputConnected(node, lastIndex)) {
                    node.removeInput(lastIndex);
                    trailingUnconnected--;
                } else {
                    break;
                }
            }

            promptIndices = getPromptInputIndices(node);
            if (!promptIndices.length) return;

            const lastPromptIndex = promptIndices[promptIndices.length - 1];
            const lastConnected = isInputConnected(node, lastPromptIndex);

            if (lastConnected) {
                const newName = getNextPromptName(node);
                node.addInput(newName, "*"); // "*" matches ANY type in Python
            }

            if (typeof node.computeSize === "function") {
                node.size = node.computeSize();
            }
            node.setDirtyCanvas(true, true);
        }

        nodeType.prototype.onNodeCreated = function () {
            originalOnNodeCreated?.apply(this, arguments);
            updateDynamicPromptInputs(this);
        };

        nodeType.prototype.onConnectionsChange = function (
            side,
            slot,
            connected,
            link_info,
            ioSlot
        ) {
            originalOnConnectionsChange?.apply(this, arguments);

            if (typeof LiteGraph !== "undefined" && side === LiteGraph.INPUT) {
                updateDynamicPromptInputs(this);
            } else {
                updateDynamicPromptInputs(this);
            }
        };
    },
});
