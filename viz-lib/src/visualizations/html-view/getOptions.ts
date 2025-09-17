const DEFAULT_OPTIONS = {
  column: null,
};

export default function getOptions(options: any) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
}
