-- Presents Entangled code blocks as a literate program.
--
-- {.typescript file=src/model.ts}  is a file Entangled writes: its header shows the path.
-- {.typescript #name}              is a named block: its header shows «name», and the
--                                  blocks that continue it (same name again) show «name» +=.
--                                  Continuations get unique HTML ids (name-2, name-3, ...),
--                                  so «name» links (literate.js) go to the first block.
--
-- Runs at Quarto's pre-ast stage, so Quarto's own `filename` handling draws the headers.

local seen = {}

function CodeBlock(el)
  local file = el.attributes["file"]
  local id = el.identifier
  if file then
    el.attributes["filename"] = file
    el.attributes["file"] = nil
    el.classes:insert("literate-file")
  elseif id ~= "" then
    local n = (seen[id] or 0) + 1
    seen[id] = n
    el.attributes["data-block"] = id
    if n == 1 then
      el.attributes["filename"] = "«" .. id .. "»"
    else
      el.attributes["filename"] = "«" .. id .. "» +="
      el.identifier = id .. "-" .. n
    end
    el.classes:insert("literate-block")
  end
  return el
end
