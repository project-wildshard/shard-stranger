# Keep the Node pin in sparse cook jobs

Stamp repo-kit a066ebb for QA32. The two publish workflows retain the
Node version file in their sparse checkouts. The workflow guard catches
any setup-node step whose sparse checkout would omit its pin.
