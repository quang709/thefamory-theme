import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export async function ensureDeliveryTimelineSchema(
  admin: AdminApiContext
) {
  console.log("➡️ Checking metaobject definitions");

  const checkRes = await admin.graphql(`
    query {
      metaobjectDefinitions(first: 50) {
        nodes {
          type
        }
      }
    }
  `);

  const checkJson = await checkRes.json();

  const exists = checkJson.data.metaobjectDefinitions.nodes.some(
    (d: any) => d.type === "delivery_timeline_rule"
  );

  if (exists) {
    console.log("✔ Metaobject schema already exists");
    return;
  }

  console.log("🆕 Creating metaobject definition");

  const createRes = await admin.graphql(`
   mutation {
  metaobjectDefinitionCreate(
    definition: {
      name: "Delivery Timeline Rule"
      type: "delivery_timeline_rule"
      fieldDefinitions: [
        {
          key: "timelines"
          name: "Timelines"
          type: "json"
          required: true
        }
      ]
    }
  ) {
    metaobjectDefinition {
      id
      type
      name
    }
    userErrors {
      field
      message
    }
  }
}

  `);

  const createJson = await createRes.json();

  console.log("CREATE RESULT:", JSON.stringify(createJson, null, 2));

  if (createJson.data.metaobjectDefinitionCreate.userErrors.length) {
    throw new Error(
      JSON.stringify(
        createJson.data.metaobjectDefinitionCreate.userErrors,
        null,
        2
      )
    );
  }

  console.log(
    "✅ Metaobject created:",
    createJson.data.metaobjectDefinitionCreate.metaobjectDefinition.type
  );
}
/* ========== SAVE TIMELINES (CREATE hoặc UPDATE) ========== */
export async function saveDeliveryTimelines(
  admin: AdminApiContext,
  timelines: any[]
) {
  console.log("💾 Saving delivery timelines...");

  // 1. Check xem đã có entry nào chưa
  const checkRes = await admin.graphql(`
    query {
      metaobjects(type: "delivery_timeline_rule", first: 1) {
        nodes {
          id
          handle
        }
      }
    }
  `);

  const checkJson = await checkRes.json();
  const existingEntry = checkJson.data.metaobjects.nodes[0];

  // Convert timelines thành JSON string (2 lần stringify để escape)
  const timelinesValue = JSON.stringify(JSON.stringify(timelines));

  if (existingEntry) {
    // 2a. UPDATE entry hiện có
    console.log("📝 Updating existing entry:", existingEntry.id);

    const updateRes = await admin.graphql(`
      mutation {
        metaobjectUpdate(
          id: "${existingEntry.id}"
          metaobject: {
            fields: [
              {
                key: "timelines"
                value: ${timelinesValue}
              }
            ]
          }
        ) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `);

    const updateJson = await updateRes.json();

    if (updateJson.data.metaobjectUpdate.userErrors.length > 0) {
      console.error("❌ Update errors:", updateJson.data.metaobjectUpdate.userErrors);
      throw new Error(JSON.stringify(updateJson.data.metaobjectUpdate.userErrors));
    }

    console.log("✅ Updated successfully");
    return { 
      success: true, 
      action: "updated", 
      id: existingEntry.id 
    };

  } else {
    // 2b. CREATE entry mới
    console.log("🆕 Creating new entry");

    const createRes = await admin.graphql(`
      mutation {
        metaobjectCreate(
          metaobject: {
            type: "delivery_timeline_rule"
            fields: [
              {
                key: "timelines"
                value: ${timelinesValue}
              }
            ]
          }
        ) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `);

    const createJson = await createRes.json();

    if (createJson.data.metaobjectCreate.userErrors.length > 0) {
      console.error("❌ Create errors:", createJson.data.metaobjectCreate.userErrors);
      throw new Error(JSON.stringify(createJson.data.metaobjectCreate.userErrors));
    }

    console.log("✅ Created successfully");
    return { 
      success: true, 
      action: "created", 
      id: createJson.data.metaobjectCreate.metaobject.id 
    };
  }
}

/* ========== GET TIMELINES (READ) ========== */
export async function getDeliveryTimelines(admin: AdminApiContext) {
  console.log("📖 Loading delivery timelines...");

  const res = await admin.graphql(`
    query {
      metaobjects(type: "delivery_timeline_rule", first: 1) {
        nodes {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    }
  `);

  const json = await res.json();
  const entry = json.data.metaobjects.nodes[0];

  if (!entry) {
    console.log("ℹ️ No timelines found");
    return null;
  }

  // Tìm field "timelines"
  const timelinesField = entry.fields.find((f: any) => f.key === "timelines");
  
  if (!timelinesField || !timelinesField.value) {
    console.log("ℹ️ Timelines field is empty");
    return null;
  }

  // Parse JSON (value đã là string, chỉ cần parse 1 lần)
  const timelines = JSON.parse(timelinesField.value);
  
  console.log("✅ Loaded timelines:", timelines.length, "rules");
  return {
    id: entry.id,
    handle: entry.handle,
    timelines
  };
}

/* ========== DELETE TIMELINES (DELETE) ========== */
export async function deleteDeliveryTimelines(admin: AdminApiContext) {
  console.log("🗑️ Deleting delivery timelines...");

  // 1. Tìm entry
  const checkRes = await admin.graphql(`
    query {
      metaobjects(type: "delivery_timeline_rule", first: 1) {
        nodes {
          id
        }
      }
    }
  `);

  const checkJson = await checkRes.json();
  const entry = checkJson.data.metaobjects.nodes[0];

  if (!entry) {
    console.log("ℹ️ No entry to delete");
    return { success: true, action: "nothing_to_delete" };
  }

  // 2. Delete entry
  const deleteRes = await admin.graphql(`
    mutation {
      metaobjectDelete(id: "${entry.id}") {
        deletedId
        userErrors {
          field
          message
        }
      }
    }
  `);

  const deleteJson = await deleteRes.json();

  if (deleteJson.data.metaobjectDelete.userErrors.length > 0) {
    console.error("❌ Delete errors:", deleteJson.data.metaobjectDelete.userErrors);
    throw new Error(JSON.stringify(deleteJson.data.metaobjectDelete.userErrors));
  }

  console.log("✅ Deleted successfully");
  return { 
    success: true, 
    action: "deleted", 
    deletedId: deleteJson.data.metaobjectDelete.deletedId 
  };
}
