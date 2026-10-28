# Indies QR image regression

`indies-sticker.jpg` is an original table-1 sticker embedded in Indies' existing
print document. Its rounded finder patterns are not read by the original Nimiq
image path. The actual ZXing-WASM regression decodes it to
`http://indies.innopay.lu/menu?table=1`, then checks that Innopay offers the HTTPS
version while retaining the table.

The user's personal table-16 phone photograph was checked separately in the
local diagnostic workspace. It is not included in this repository.
