function run(argv) {
  const Notes = Application("Notes");
  const folders = Notes.folders.whose({ name: argv[0] })();
  if (!folders.length) return JSON.stringify({ error: "no-folder" });
  return JSON.stringify(
    folders[0].notes().map((n) => ({
      id: n.id(),
      name: n.name(),
      created: n.creationDate().toISOString(),
      modified: n.modificationDate().toISOString(),
      text: n.plaintext().slice(0, 1500),
    })),
  );
}
