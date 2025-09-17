import getOptions from "./getOptions";
import Renderer from "./Renderer";
import Editor from "./Editor";

export default {
  type: "HTML_VIEW",
  name: "HTML View",
  getOptions,
  Renderer,
  Editor,
  autoHeight: true,
  defaultRows: 12,
  defaultColumns: 3,
};
