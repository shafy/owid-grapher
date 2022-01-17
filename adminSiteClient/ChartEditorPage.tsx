import * as React from "react"
import { observer } from "mobx-react"
import {
    observable,
    computed,
    runInAction,
    autorun,
    action,
    reaction,
    IReactionDisposer,
} from "mobx"
import { Prompt, Redirect } from "react-router-dom"
import { Bounds } from "../clientUtils/Bounds"
import { capitalize } from "../clientUtils/Util"
import { Grapher } from "../grapher/core/Grapher"
import { Admin } from "./Admin"
import {
    ChartEditor,
    EditorDatabase,
    Log,
    PostReference,
    ChartRedirect,
    ChartEditorManager,
} from "./ChartEditor"
import { EditorBasicTab } from "./EditorBasicTab"
import { EditorDataTab } from "./EditorDataTab"
import { EditorTextTab } from "./EditorTextTab"
import { EditorCustomizeTab } from "./EditorCustomizeTab"
import { EditorScatterTab } from "./EditorScatterTab"
import { EditorMapTab } from "./EditorMapTab"
import { EditorHistoryTab } from "./EditorHistoryTab"
import { EditorReferencesTab } from "./EditorReferencesTab"
import { SaveButtons } from "./SaveButtons"
import { LoadingBlocker } from "./Forms"
import { AdminLayout } from "./AdminLayout"
import { AdminAppContext, AdminAppContextType } from "./AdminAppContext"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faMobile } from "@fortawesome/free-solid-svg-icons/faMobile"
import { faDesktop } from "@fortawesome/free-solid-svg-icons/faDesktop"
import {
    VisionDeficiency,
    VisionDeficiencySvgFilters,
    VisionDeficiencyDropdown,
    VisionDeficiencyEntity,
} from "./VisionDeficiencies"
import { EditorMarimekkoTab } from "./EditorMarimekkoTab"
import { Topic } from "../grapher/core/GrapherConstants"

@observer
class TabBinder extends React.Component<{ editor: ChartEditor }> {
    dispose!: IReactionDisposer
    componentDidMount(): void {
        //window.addEventListener("hashchange", this.onHashChange)
        this.onHashChange()

        this.dispose = autorun(() => {
            //setTimeout(() => window.location.hash = `#${tab}-tab`, 100)
        })
    }

    componentWillUnmount(): void {
        //window.removeEventListener("hashchange", this.onHashChange)
        this.dispose()
    }

    render(): null {
        return null
    }

    @action.bound onHashChange(): void {
        const match = window.location.hash.match(/#(.+?)-tab/)
        if (match) {
            const tab = match[1]
            if (
                this.props.editor.grapher &&
                this.props.editor.availableTabs.includes(tab)
            )
                this.props.editor.tab = tab
        }
    }
}

@observer
export class ChartEditorPage
    extends React.Component<{
        grapherId?: number
        newGrapherIndex?: number
        grapherConfig?: any
    }>
    implements ChartEditorManager
{
    @observable.ref grapher = new Grapher()
    @observable.ref database = new EditorDatabase({})
    @observable logs: Log[] = []
    @observable references: PostReference[] = []
    @observable redirects: ChartRedirect[] = []
    @observable allTopics: Topic[] = []

    @observable.ref grapherElement?: JSX.Element

    static contextType = AdminAppContext
    context!: AdminAppContextType

    @observable simulateVisionDeficiency?: VisionDeficiency

    async fetchGrapher(): Promise<void> {
        const { grapherId, grapherConfig } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? grapherConfig
                : await admin.getJSON(`/api/charts/${grapherId}.config.json`)
        this.loadGrapherJson(json)
    }

    @observable private _isDbSet = false
    @observable private _isGrapherSet = false
    @computed get isReady(): boolean {
        return this._isDbSet && this._isGrapherSet
    }

    @action.bound private loadGrapherJson(json: any): void {
        this.grapherElement = (
            <Grapher
                {...{
                    ...json,
                    bounds:
                        this.editor?.previewMode === "mobile"
                            ? new Bounds(0, 0, 360, 500)
                            : new Bounds(0, 0, 800, 600),
                    getGrapherInstance: (grapher) => {
                        this.grapher = grapher
                    },
                }}
            />
        )
        this._isGrapherSet = true
    }

    @action.bound private setDb(json: any): void {
        this.database = new EditorDatabase(json)
        this._isDbSet = true
    }

    async fetchData(): Promise<void> {
        const { admin } = this.context
        const json = await admin.getJSON(`/api/editorData/namespaces.json`)
        this.setDb(json)
    }

    async fetchLogs(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? []
                : await admin.getJSON(`/api/charts/${grapherId}.logs.json`)
        runInAction(() => (this.logs = json.logs))
    }

    async fetchRefs(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? []
                : await admin.getJSON(
                      `/api/charts/${grapherId}.references.json`
                  )
        runInAction(() => (this.references = json.references || []))
    }

    async fetchRedirects(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? []
                : await admin.getJSON(`/api/charts/${grapherId}.redirects.json`)
        runInAction(() => (this.redirects = json.redirects))
    }

    async fetchTopics(): Promise<void> {
        const { admin } = this.context
        const json = await admin.getJSON(`/api/topics.json`)
        runInAction(() => (this.allTopics = json.topics))
    }

    @computed get admin(): Admin {
        return this.context.admin
    }

    @computed get editor(): ChartEditor | undefined {
        if (!this.isReady) return undefined

        return new ChartEditor({ manager: this })
    }

    @action.bound refresh(): void {
        this.fetchGrapher()
        this.fetchData()
        this.fetchLogs()
        this.fetchRefs()
        this.fetchRedirects()
        this.fetchTopics()
    }

    dispose!: IReactionDisposer
    componentDidMount(): void {
        this.refresh()

        this.dispose = reaction(
            () => this.editor && this.editor.previewMode,
            () => {
                if (this.editor) {
                    localStorage.setItem(
                        "editorPreviewMode",
                        this.editor.previewMode
                    )
                }
            }
        )
    }

    // This funny construction allows the "new chart" link to work by forcing an update
    // even if the props don't change
    UNSAFE_componentWillReceiveProps(): void {
        setTimeout(() => this.refresh(), 0)
    }

    componentWillUnmount(): void {
        this.dispose()
    }

    render(): JSX.Element {
        return (
            <AdminLayout noSidebar>
                <main className="ChartEditorPage">
                    {(this.editor === undefined ||
                        this.editor.currentRequest) && <LoadingBlocker />}
                    {this.editor !== undefined && this.renderReady(this.editor)}
                </main>
            </AdminLayout>
        )
    }

    renderReady(editor: ChartEditor): JSX.Element {
        const { grapher, availableTabs, previewMode } = editor

        return (
            <React.Fragment>
                {!editor.newChartId && (
                    <Prompt
                        when={editor.isModified}
                        message="Are you sure you want to leave? Unsaved changes will be lost."
                    />
                )}
                {editor.newChartId && (
                    <Redirect to={`/charts/${editor.newChartId}/edit`} />
                )}
                <TabBinder editor={editor} />
                <div className="chart-editor-settings">
                    <div className="p-2">
                        <ul className="nav nav-tabs">
                            {availableTabs.map((tab) => (
                                <li key={tab} className="nav-item">
                                    <a
                                        className={
                                            "nav-link" +
                                            (tab === editor.tab
                                                ? " active"
                                                : "")
                                        }
                                        onClick={() => (editor.tab = tab)}
                                    >
                                        {capitalize(tab)}
                                        {tab === "refs" &&
                                        this.references.length
                                            ? ` (${this.references.length})`
                                            : ""}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="innerForm container">
                        {editor.tab === "basic" && (
                            <EditorBasicTab editor={editor} />
                        )}
                        {editor.tab === "text" && (
                            <EditorTextTab editor={editor} />
                        )}
                        {editor.tab === "data" && (
                            <EditorDataTab editor={editor} />
                        )}
                        {editor.tab === "customize" && (
                            <EditorCustomizeTab editor={editor} />
                        )}
                        {editor.tab === "scatter" && (
                            <EditorScatterTab grapher={grapher} />
                        )}
                        {editor.tab === "marimekko" && (
                            <EditorMarimekkoTab grapher={grapher} />
                        )}
                        {editor.tab === "map" && (
                            <EditorMapTab editor={editor} />
                        )}
                        {editor.tab === "revisions" && (
                            <EditorHistoryTab editor={editor} />
                        )}
                        {editor.tab === "refs" && (
                            <EditorReferencesTab editor={editor} />
                        )}
                    </div>
                    <SaveButtons editor={editor} />
                </div>
                <div className="chart-editor-view">
                    <figure
                        data-grapher-src
                        style={{
                            filter:
                                this.simulateVisionDeficiency &&
                                `url(#${this.simulateVisionDeficiency.id})`,
                        }}
                    >
                        {this.grapherElement}
                    </figure>
                    <div>
                        <div
                            className="btn-group"
                            data-toggle="buttons"
                            style={{ whiteSpace: "nowrap" }}
                        >
                            <label
                                className={
                                    "btn btn-light" +
                                    (previewMode === "mobile" ? " active" : "")
                                }
                                title="Mobile preview"
                            >
                                <input
                                    type="radio"
                                    onChange={action(
                                        () => (editor.previewMode = "mobile")
                                    )}
                                    name="previewSize"
                                    id="mobile"
                                    checked={previewMode === "mobile"}
                                />{" "}
                                <FontAwesomeIcon icon={faMobile} />
                            </label>
                            <label
                                className={
                                    "btn btn-light" +
                                    (previewMode === "desktop" ? " active" : "")
                                }
                                title="Desktop preview"
                            >
                                <input
                                    onChange={action(
                                        () => (editor.previewMode = "desktop")
                                    )}
                                    type="radio"
                                    name="previewSize"
                                    id="desktop"
                                    checked={previewMode === "desktop"}
                                />{" "}
                                <FontAwesomeIcon icon={faDesktop} />
                            </label>
                        </div>
                        <div
                            className="form-group d-inline-block"
                            style={{ width: 250, marginLeft: 15 }}
                        >
                            Emulate vision deficiency:{" "}
                            <VisionDeficiencyDropdown
                                onChange={action(
                                    (option: VisionDeficiencyEntity) =>
                                        (this.simulateVisionDeficiency =
                                            option.deficiency)
                                )}
                            />
                        </div>
                    </div>

                    {/* Include svg filters necessary for vision deficiency emulation */}
                    <VisionDeficiencySvgFilters />
                </div>
            </React.Fragment>
        )
    }
}
