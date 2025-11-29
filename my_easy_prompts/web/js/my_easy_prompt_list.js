import { app } from "/scripts/app.js";

app.registerExtension({
    name: "my_easy_prompt_list_node.MyEasyPromptListUI",
    async beforeRegisterNodeDef(nodeType, nodeData, app_) {
        // Only hook our custom node by name
        if (nodeData.name !== "My Easy Prompt List") {
            return;
        }

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        const originalConfigure = nodeType.prototype.configure;
        const originalOnSerialize = nodeType.prototype.onSerialize;

        nodeType.prototype._cp_init = function (info) {
            const node = this;
            node.serialize_widgets = true;
            node.widgets = node.widgets || [];

            // ----- Find base widgets -----
            let promptListWidget = null;
            let delimiterWidget = null;

            for (const w of node.widgets) {
                if (w.name === "prompt_list") {
                    promptListWidget = w;
                } else if (w.name === "delimiter") {
                    delimiterWidget = w;
                }
            }

            // Ensure delimiter widget exists and has default ","
            if (!delimiterWidget) {
                delimiterWidget = node.addWidget("text", "delimiter", ",", null);
            }
            if (!delimiterWidget.value) {
                delimiterWidget.value = ",";
            }

            // Hide the raw prompt_list widget (internal only)
            if (promptListWidget) {
                if (promptListWidget.inputEl) {
                    promptListWidget.inputEl.style.display = "none";
                }
                // No height / no size
                promptListWidget.computeSize = () => [0, -4];
            }

            // --- Decide where our custom widgets start: right after delimiter ---
            const delimiterIndex = node.widgets.indexOf(delimiterWidget);
            const cpStartIndex =
                delimiterIndex >= 0 ? delimiterIndex + 1 : node.widgets.length;

            if (node._cp_widgets_start_index == null) {
                node._cp_widgets_start_index = cpStartIndex;
            } else {
                // Clear old MyEasyPromptList widgets on re-configure
                node.widgets.length = node._cp_widgets_start_index;
            }

            node._cp_rows = [];
            let toggleAllWidget = null;
            let addPromptButtonWidget = null;

            // --- Rebuild prompt_list string from rows ---
            const rebuildPromptList = () => {
                const delim = delimiterWidget?.value || ",";
                const enabledTexts = node._cp_rows
                    .filter((row) => row.toggle.value)
                    .map((row) => (row.text.value || "").trim())
                    .filter((t) => t.length > 0);

                const joined = enabledTexts.join(delim);

                if (promptListWidget) {
                    promptListWidget.value = joined;
                    if (typeof promptListWidget.callback === "function") {
                        promptListWidget.callback(joined);
                    }
                }

                node.setDirtyCanvas(true, true);
            };

            // --- Add one row: toggle + single-line text ---
            node._cp_addRow = function (rowData = {}) {
                const enabledValue =
                    rowData.enabled !== undefined ? rowData.enabled : true;
                const textValue = rowData.text || "";

                const hadAddButton =
                    addPromptButtonWidget &&
                    node.widgets.includes(addPromptButtonWidget);

                if (hadAddButton) {
                    const idx = node.widgets.indexOf(addPromptButtonWidget);
                    if (idx !== -1) {
                        node.widgets.splice(idx, 1); // temporarily remove
                    }
                }

                // Individual toggle
                const toggle = node.addWidget(
                    "toggle",
                    "Enabled",
                    enabledValue,
                    () => {
                        rebuildPromptList();
                    }
                );

                // Single-line prompt string
                const text = node.addWidget(
                    "text",
                    "My Easy Prompt List",
                    textValue,
                    () => {
                        rebuildPromptList();
                    }
                );

                node._cp_rows.push({ toggle, text });

                // Reinsert Add Prompt so it's always last
                if (hadAddButton && addPromptButtonWidget) {
                    node.widgets.push(addPromptButtonWidget);
                }

                node.setDirtyCanvas(true, true);
                rebuildPromptList();
            };

            // --- Toggle All widget (always right under delimiter) ---
            toggleAllWidget = node.addWidget(
                "toggle",
                "Toggle All",
                true,
                (value) => {
                    node._cp_rows.forEach((row) => {
                        row.toggle.value = value;
                    });
                    rebuildPromptList();
                }
            );

            // --- Restore rows from saved workflow if present ---
            const storedRows =
                (info &&
                    info.properties &&
                    info.properties.__my_easy_prompt_list_rows) ||
                node.properties?.__my_easy_prompt_list_rows;

            if (Array.isArray(storedRows) && storedRows.length > 0) {
                storedRows.forEach((row) =>
                    node._cp_addRow({
                        text: row.text || "",
                        enabled: !!row.enabled,
                    })
                );

                if (storedRows.some((r) => r.enabled === false)) {
                    toggleAllWidget.value = false;
                }
            }

            // --- Add Prompt button (always at bottom) ---
            addPromptButtonWidget = node.addWidget(
                "button",
                "Add Prompt",
                null,
                () => {
                    node._cp_addRow({
                        text: "",
                        enabled: toggleAllWidget.value,
                    });
                    return true;
                }
            );

            // When delimiter changes, recompute prompt_list
            if (delimiterWidget) {
                const origDelimCallback = delimiterWidget.callback;
                delimiterWidget.callback = function (v) {
                    if (origDelimCallback) {
                        origDelimCallback(v);
                    }
                    rebuildPromptList();
                };
            }

            rebuildPromptList();
        };

        // Node created from scratch
        nodeType.prototype.onNodeCreated = function () {
            const r = originalOnNodeCreated
                ? originalOnNodeCreated.apply(this, arguments)
                : undefined;
            this._cp_init(undefined);
            return r;
        };

        // Node loaded from saved workflow
        nodeType.prototype.configure = function (info) {
            const r = originalConfigure
                ? originalConfigure.call(this, info)
                : undefined;
            this._cp_init(info);
            return r;
        };

        // Save our rows to properties
        nodeType.prototype.onSerialize = function (o) {
            const r = originalOnSerialize
                ? originalOnSerialize.call(this, o)
                : undefined;

            if (!o.properties) o.properties = {};

            o.properties.__my_easy_prompt_list_rows = (this._cp_rows || []).map(
                (row) => ({
                    text: row.text.value || "",
                    enabled: !!row.toggle.value,
                })
            );

            return r;
        };
    },
});
