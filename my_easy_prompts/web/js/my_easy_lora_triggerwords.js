import { app } from "/scripts/app.js";

app.registerExtension({
    name: "MyEasyLoraTriggerwords.UI",

    async beforeRegisterNodeDef(nodeType, nodeData, app_) {
        // Must match the internal node name from Python (NODE_CLASS_MAPPINGS key)
        if (nodeData.name !== "My Easy Lora Triggerwords") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        const origConfigure = nodeType.prototype.configure;

        nodeType.prototype.onNodeCreated = function () {
            if (origOnNodeCreated) {
                origOnNodeCreated.apply(this, arguments);
            }

            const node = this;

            function attachLoraTitleBinding() {
                if (!node.widgets) return;

                const w = node.widgets.find(w => w.name === "lora_file");
                if (!w) return;

                // Initial title based on current value
                if (
                    typeof w.value === "string" &&
                    w.value &&
                    !w.value.startsWith("<") // avoid placeholder text
                ) {
                    node.title = w.value;
                    if (node.graph) node.graph.setDirtyCanvas(true, true);
                }

                const originalCallback = w.callback;

                w.callback = function (value, ...args) {
                    // Call any existing callback first (to not break other behavior)
                    if (originalCallback) {
                        originalCallback.call(this, value, ...args);
                    }

                    // Now update the node title to match the selected LoRA file
                    if (
                        typeof value === "string" &&
                        value &&
                        !value.startsWith("<")
                    ) {
                        node.title = value;
                        if (node.graph) node.graph.setDirtyCanvas(true, true);
                    }
                };
            }

            // Attach when node is created
            attachLoraTitleBinding();

            // Also re-attach whenever node is reconfigured (e.g., config update)
            this.configure = function () {
                const r = origConfigure
                    ? origConfigure.apply(this, arguments)
                    : undefined;
                attachLoraTitleBinding();
                return r;
            };
        };
    },
});
