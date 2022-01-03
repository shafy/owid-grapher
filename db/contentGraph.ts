import {
    ChartRecord,
    DocumentNode,
    WP_PostType,
} from "../clientUtils/owidTypes"
import { once } from "../clientUtils/Util"
import { queryMysql } from "./db"
import { ENTRIES_CATEGORY_ID, getDocumentsInfo } from "./wpdb"

const fortune = require("fortune") // Works in web browsers, too.
const MemoryAdapter = require("fortune/lib/adapter/adapters/memory")
const {
    errors: { ConflictError },
} = fortune

export enum GraphType {
    Document = "document",
    Chart = "chart",
}

const store = fortune(
    {
        [GraphType.Document]: {
            title: String,
            slug: String,
            content: String,
            parentTopics: [Array(GraphType.Document), "childrenTopics"],
            childrenTopics: [Array(GraphType.Document), "parentTopics"],
            embeddedCharts: [Array(GraphType.Chart), "embeddedIn"],
            charts: [Array(GraphType.Chart), "topics"],
            ancestorsPaths: Array(String),
        },
        [GraphType.Chart]: {
            title: String,
            embeddedIn: [Array(GraphType.Document), "embeddedCharts"],
            topics: [Array(GraphType.Document), "charts"],
        },
    },
    {
        adapter: [
            MemoryAdapter,
            {
                // see https://github.com/fortunejs/fortune/commit/70593721efae304ff2db40d1b8f9b43295fed79b#diff-ebb028a2d1528eac83ee833036ef6e50bed6fb7b2b7137f59ac1fb567a5e6ec2R25
                recordsPerType: Infinity,
            },
        ],
    }
)

const getAncestorsPaths = async (
    node: DocumentNode,
    allDocumentNodes: DocumentNode[],
    previousPath = ""
): Promise<string[]> => {
    const currentPath = `${previousPath ? previousPath + " > " : ""}${
        node.title
    }`
    // if (!node.parentTopics || node.parentTopics.length === 0)
    //     return [currentPath]

    const parentTopicsPaths = await Promise.all(
        node.parentTopics.map(async (parentTopic: number) => {
            const parentNode = (
                await store.find(GraphType.Document, parentTopic)
            ).payload.records[0]

            const ancestorsPaths = await getAncestorsPaths(
                parentNode,
                allDocumentNodes,
                currentPath
            )
            return ancestorsPaths
        })
    )

    return [currentPath, ...parentTopicsPaths.flat()]
}

export const getChartsRecords = async (): Promise<ChartRecord[]> => {
    const allCharts = await queryMysql(`
        SELECT config->>"$.slug" AS slug, config->>"$.title" AS title, config->>"$.topicIds" as topics
        FROM charts
        WHERE publishedAt IS NOT NULL
        AND is_indexable IS TRUE
    `)

    const records = []
    for (const c of allCharts) {
        records.push({
            slug: c.slug,
            title: c.title,
            topics: JSON.parse(c.topics),
        })
    }

    return records
}

export const getGrapherSlugs = (content: string | null): Set<string> => {
    const slugs = new Set<string>()
    if (!content) return slugs

    const matches = content.matchAll(/\/grapher\/([a-zA-Z0-9-]+)/g)
    for (const match of matches) {
        slugs.add(match[1])
    }
    return slugs
}

const throwAllButConflictError = (err: unknown): void => {
    if (!(err instanceof ConflictError)) {
        throw err
    }
}

export const getContentGraph = once(async () => {
    const orderBy = "orderby:{field:MODIFIED, order:DESC}"
    const entries = await getDocumentsInfo(
        WP_PostType.Page,
        "",
        `categoryId: ${ENTRIES_CATEGORY_ID}, ${orderBy}`
    )
    const posts = await getDocumentsInfo(WP_PostType.Post, "", orderBy)
    const documents = [...entries, ...posts]

    for (const document of documents) {
        // Create the parent topics first (add records with the only available
        // referential information - id - then update the records when going
        // through the parent topic as a document)
        for (const parentTopic of document.parentTopics) {
            try {
                await store.create(GraphType.Document, {
                    id: parentTopic,
                })
            } catch (err) {
                // If the document has already being added as a parent topic of
                // another document, a ConflictError will be raised. Any other
                // error will be thrown.
                throwAllButConflictError(err)
            }
        }

        // Add posts and entries to the content graph
        try {
            await store.create(GraphType.Document, document)
        } catch (err) {
            // If the document has already been added as a parent, a
            // ConflictError will be raised.
            throwAllButConflictError(err)

            const { id, ...rest } = document
            await store.update(GraphType.Document, {
                id,
                replace: {
                    ...rest,
                },
            })
        }

        // Add embedded charts within that post to the content graph
        const grapherSlugs = getGrapherSlugs(document.content)

        for (const slug of grapherSlugs) {
            try {
                await store.create(GraphType.Chart, {
                    id: slug,
                    embeddedIn: [document.id],
                })
            } catch (err) {
                // ConflictErrors occur when attempting to create a chart that
                // already exists
                throwAllButConflictError(err)

                try {
                    await store.update(GraphType.Chart, {
                        id: slug,
                        push: { embeddedIn: document.id },
                    })
                } catch (err) {
                    // ConflictErrors occur here when a chart <-> post
                    // relationship already exists
                    throwAllButConflictError(err)
                }
            }
        }
    }

    // Add all charts
    const allCharts = await getChartsRecords()

    for (const chart of allCharts) {
        const { slug, title, topics } = chart
        try {
            await store.create(GraphType.Chart, {
                id: slug,
                title,
                topics: topics ?? [],
            })
        } catch (err) {
            // ConflictErrors occur when a chart has already been added from an
            // embedding document
            throwAllButConflictError(err)
            await store.update(GraphType.Chart, {
                id: slug,
                replace: { title, topics: topics ?? [] },
            })
        }
    }

    const allDocumentNodes: DocumentNode[] = (
        await store.find(GraphType.Document)
    ).payload.records

    for (const documentNode of allDocumentNodes) {
        const ancestorsPaths = await getAncestorsPaths(
            documentNode,
            allDocumentNodes
        )

        await store.update(GraphType.Document, {
            id: documentNode.id,
            replace: {
                ancestorsPaths,
            },
        })
    }

    return store
})

const main = async (): Promise<void> => {
    await getContentGraph()
}

if (require.main === module) main()
