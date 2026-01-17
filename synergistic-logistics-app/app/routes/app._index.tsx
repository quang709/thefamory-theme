import { useEffect, useMemo, useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { saveDeliveryTimelines ,getDeliveryTimelines } from "../lib/metaobject.server";


/* ===================== TYPES ===================== */
type PickedCollection = {
  id: string;
  title: string;
};

type TimelineValues = {
  collections: PickedCollection[];
  // startFrom: string;
  shippingFrom: string;
  shippingTo: string;
  deliveryFrom: string;
  deliveryTo: string;
};

type TimelineErrors = Partial<Record<keyof TimelineValues, string>>;

type TimelineState = {
  id: string;
  values: TimelineValues;
  errors: TimelineErrors;
};

/* ===================== INIT ===================== */
const newTimeline = (): TimelineState => ({
  id: crypto.randomUUID(),
  values: {
    collections: [],
    // startFrom: "",
    shippingFrom: "",
    shippingTo: "",
    deliveryFrom: "",
    deliveryTo: "",
  },
  errors: {},
});

/* ===================== VALIDATION ===================== */
function validateNumber(raw: string, options?: { min?: number; required?: boolean }): string | undefined {
  if (raw === "") return options?.required ? "Required" : undefined;
  if (!/^\d+$/.test(raw)) return "Must be a number";

  const n = Number(raw);
  if (options?.min != null && n < options.min) return `Must be ${options.min} or greater`;
}

function validateTimeline(values: TimelineValues): TimelineErrors {
  const errors: TimelineErrors = {};

  // errors.startFrom = validateNumber(values.startFrom, { required: true, min: 0 });
  errors.shippingFrom = validateNumber(values.shippingFrom, { required: true, min: 0 });
  errors.shippingTo = validateNumber(values.shippingTo, { required: true, min: 0 });
  errors.deliveryFrom = validateNumber(values.deliveryFrom, { required: true, min: 0 });
  errors.deliveryTo = validateNumber(values.deliveryTo, { required: true, min: 0 });

  if (values.shippingFrom && values.shippingTo && Number(values.shippingFrom) > Number(values.shippingTo)) {
    errors.shippingTo = "Must be ≥ Shipping from";
  }

  if (values.deliveryFrom && values.deliveryTo && Number(values.deliveryFrom) > Number(values.deliveryTo)) {
    errors.deliveryTo = "Must be ≥ Delivery from";
  }

  return errors;
}

/* ===================== LOADER ===================== */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const result = await getDeliveryTimelines(admin);
  
  const existingTimelines = result ? result.timelines : []; 
  
  if (existingTimelines.length === 0) {
    return json({ initialTimelines: [newTimeline()] });
  }

  // 1. Collect all unique collection GIDs
  const collectionIds = [
    ...new Set(existingTimelines.flatMap((t: any) => t.collections)),
  ];

  let collectionTitleMap = new Map<string, string>();

  // 2. Fetch titles for the collected GIDs
  if (collectionIds.length > 0) {
    const collectionsRes = await admin.graphql(
      `#graphql
      query getCollectionTitles($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Collection {
            id
            title
          }
        }
      }`,
      { variables: { ids: collectionIds } }
    );

    const collectionsJson = await collectionsRes.json();
    if (collectionsJson.data.nodes) {
      collectionsJson.data.nodes.forEach((node: any) => {
        if (node) {
          collectionTitleMap.set(node.id, node.title);
        }
      });
    }
  }
  
  // 3. Build the initial state with correct titles
  const initialTimelines: TimelineState[] = existingTimelines.map((t: any) => ({
    id: crypto.randomUUID(),
    values: {
      collections: t.collections.map((id: string) => ({
        id,
        title: collectionTitleMap.get(id) || `Collection ${id.split('/').pop()}`, // Fallback to ID if title not found
      })),
      // startFrom: String(t.startFrom),
      shippingFrom: String(t.shippingFrom),
      shippingTo: String(t.shippingTo),
      deliveryFrom: String(t.deliveryFrom),
      deliveryTo: String(t.deliveryTo),
    },
    errors: {},
  }));

  return json({ initialTimelines });
};
// ✅ Tạo json helper function
const json = (data: any, init?: ResponseInit) => {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
};
/* ===================== ACTION ===================== */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const raw = formData.get("timelines");
  if (!raw) return json({ ok: false, error: "No data" });

  const timelines = JSON.parse(raw as string);
  console.log("SAVE:", timelines);

  try {
    const result = await saveDeliveryTimelines(admin, timelines);
    return json({ ok: true, ...result });
  } catch (error: any) {
    console.error("❌ Save failed:", error);
    return json({ ok: false, error: error.message }, { status: 500 });
  }
};

/* ===================== REUSABLE FIELD ===================== */
function NumberField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <s-text-field
      label={label}
      type="number"
      value={value}
      error={error}
      inputMode="numeric"
      onKeyDown={(e: KeyboardEvent) => {
        if (["-", "+", "e", "E", ".","="].includes(e.key)) e.preventDefault();
      }}
      onChange={(e: Event) => onChange((e.target as HTMLInputElement).value)}
    />
  );
}

/* ===================== PAGE ===================== */
export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const { initialTimelines } = useLoaderData<typeof loader>(); // Get data from loader

  const [timelines, setTimelines] = useState<TimelineState[]>(initialTimelines);

  /* ---------- FIELD UPDATE ---------- */

  const updateField = useCallback(
    (timelineId: string, key: keyof TimelineValues, value: string) => {
      setTimelines((prev) =>
        prev.map((t) => {
          if (t.id !== timelineId) return t;

          const newValues = { ...t.values, [key]: value };

          return {
            ...t,
            values: newValues,
            errors: validateTimeline(newValues),
          };
        })
      );
    },
    []
  );

  /* ---------- COLLECTION UPDATE ---------- */

  const updateCollections = useCallback(
    (timelineId: string, picked: PickedCollection[]) => {
      setTimelines((prev) =>
        prev.map((t) => {
          if (t.id !== timelineId) return t;
  
          const newValues = {
            ...t.values,
            collections: picked,
          };
  
          return {
            ...t,
            values: newValues,
            errors: validateTimeline(newValues),
          };
        })
      );
    },
    []
  );
  

  /* ---------- VALIDATION CHECK ---------- */

  const hasErrors = useMemo(() => {
    return timelines.some((t) =>
      Object.values(t.errors).some(Boolean)
    );
  }, [timelines]);

  /* ---------- SAVE HANDLER ---------- */

  const handleSave = useCallback(() => {
    let hasValidationErrors = false;

    const validated = timelines.map((t) => {
      const errors = validateTimeline(t.values);

      if (Object.values(errors).some(Boolean)) {
        hasValidationErrors = true;
      }

      return { ...t, errors };
    });

    setTimelines(validated);

    if (hasValidationErrors) {
      shopify.toast.show("Please fix errors before saving", {
        isError: true,
      });
      return;
    }

    fetcher.submit(
      {
        timelines: JSON.stringify(
          timelines.map((t) => ({
            collections: t.values.collections.map((c) => c.id),
            // startFrom: Number(t.values.startFrom),
            shippingFrom: Number(t.values.shippingFrom),
            shippingTo: Number(t.values.shippingTo),
            deliveryFrom: Number(t.values.deliveryFrom),
            deliveryTo: Number(t.values.deliveryTo),
          }))
        ),
      },
      { method: "POST" }
    );
  }, [timelines, fetcher, shopify]);

  /* ---------- OPEN PICKER ---------- */

  const openCollectionPicker = useCallback(
    async (timelineId: string) => {
      try {
        const selected = await shopify.resourcePicker({
          type: "collection",
          multiple: true,
        });
  
        if (!selected || selected.length === 0) return;
  
        const picked: PickedCollection[] = selected.map((s: any) => ({
          id: s.id,
          title: s.title,
        }));
  
        updateCollections(timelineId, picked);
      } catch {
        console.log("Picker canceled");
      }
    },
    [updateCollections]
  );
  

  /* ---------- TOAST AFTER SAVE ---------- */

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Timelines saved");
    }
  }, [fetcher.data, shopify]);

  /* ---------- RENDER ---------- */

  return (
    <s-page heading="Delivery Timelines (ETA rules)">
      <s-button
        slot="primary-action"
        variant="primary"
        loading={fetcher.state !== "idle"}
        onClick={handleSave}
      >
        Save timelines
      </s-button>

      <s-section>
        <s-button
          variant="secondary"
          onClick={() =>
            setTimelines((prev) => [...prev, newTimeline()])
          }
        >
          + Add timeline
        </s-button>
      </s-section>

      {timelines.map((t, index) => (
        <s-section
          key={t.id}
          heading={`Timeline ${index + 1}`}
        >
          <s-stack direction="block" gap="base">

            {/* Hiển thị title thay vì GID */}
            <s-text-field
              label="Collections"
              value={
                t.values.collections
                  .map((c) => c.title)
                  .join(", ")
              }
              readOnly
            />

            <s-button
              variant="secondary"
              onClick={() =>
                openCollectionPicker(t.id)
              }
            >
              Pick Collections
            </s-button>

            {/* <NumberField
              label="Start (days)"
              value={t.values.startFrom}
              error={t.errors.startFrom}
              onChange={(v) =>
                updateField(t.id, "startFrom", v)
              }
            /> */}

            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <NumberField
                  label="Shipping from (days)"
                  value={t.values.shippingFrom}
                  error={t.errors.shippingFrom}
                  onChange={(v) =>
                    updateField(t.id, "shippingFrom", v)
                  }
                />
              </div>

              <div style={{ flex: 1 }}>
                <NumberField
                  label="Shipping to (days)"
                  value={t.values.shippingTo}
                  error={t.errors.shippingTo}
                  onChange={(v) =>
                    updateField(t.id, "shippingTo", v)
                  }
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1 }}>
                <NumberField
                  label="Delivery from (days)"
                  value={t.values.deliveryFrom}
                  error={t.errors.deliveryFrom}
                  onChange={(v) =>
                    updateField(t.id, "deliveryFrom", v)
                  }
                />
              </div>

              <div style={{ flex: 1 }}>
                <NumberField
                  label="Delivery to (days)"
                  value={t.values.deliveryTo}
                  error={t.errors.deliveryTo}
                  onChange={(v) =>
                    updateField(t.id, "deliveryTo", v)
                  }
                />
              </div>
            </div>

            <s-button             
              tone="critical"
              onClick={() =>
                setTimelines((prev) =>
                  prev.filter((x) => x.id !== t.id)
                )
              }
            >
              Remove timeline
            </s-button>

          </s-stack>
        </s-section>
      ))}
    </s-page>
  );
}


export const headers: HeadersFunction = args => boundary.headers(args);
