export const store = {
    selectedId: null,
    selectedNode: null,
    collapsed: new Set(),
    tree: [],

    select(id, node = null) {
        this.selectedId = id;
        this.selectedNode = node;
        document.dispatchEvent(new CustomEvent('dyn:select', { detail: id }));
    },
};
