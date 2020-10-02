import React from "react"
import { observer } from "mobx-react"
import { action, observable, computed, autorun } from "mobx"
import { GrapherInterface } from "grapher/core/GrapherInterface"
import { Grapher } from "grapher/core/Grapher"
import { ExplorerControlPanel } from "explorer/client/ExplorerControls"
import { ExtendedGrapherUrl } from "grapher/core/GrapherUrl"
import ReactDOM from "react-dom"
import { UrlBinder } from "grapher/utils/UrlBinder"
import { ExplorerShell } from "./ExplorerShell"
import { ExplorerProgram, ExplorerManager } from "./ExplorerProgram"
import { QueryParams, strToQueryParams } from "utils/client/url"
import { EntityUrlBuilder } from "grapher/core/EntityUrlBuilder"

export interface SwitcherExplorerProps {
    explorerProgramCode: string
    slug: string
    chartConfigs?: GrapherInterface[]
    bindToWindow?: boolean
    queryString?: string
}

@observer
export class SwitcherExplorer
    extends React.Component<SwitcherExplorerProps>
    implements ExplorerManager {
    static bootstrap(props: SwitcherExplorerProps) {
        return ReactDOM.render(
            <SwitcherExplorer
                {...props}
                queryString={window.location.search}
            />,
            document.getElementById("explorerContainer")
        )
    }

    private urlBinding?: UrlBinder

    private explorerProgram = new ExplorerProgram(
        this.props.slug,
        this.props.explorerProgramCode,
        this.props.queryString,
        this
    )

    @observable chartId: number = this.explorerProgram.switcherRuntime.chartId

    @observable.ref private grapher = new Grapher()

    @observable hideControls = false

    @computed get toQueryParams(): QueryParams {
        const params: any = {}
        params.hideControls = this.hideControls ? true : undefined
        params.country = EntityUrlBuilder.entitiesToQueryParam(
            this.grapher.table.selectedEntityNames || []
        )
        return params as QueryParams
    }

    componentDidMount() {
        autorun(() => this.switchGrapher(this.chartId))
    }

    @computed get chartConfigs() {
        const arr = this.props.chartConfigs || []
        const chartConfigsMap: Map<number, GrapherInterface> = new Map()
        arr.forEach((config) => chartConfigsMap.set(config.id!, config))
        return chartConfigsMap
    }

    @action.bound private switchGrapher(id: number) {
        this.grapher = this.getGrapher(id, this.grapher)
        if (!this.props.bindToWindow) return

        const url = new ExtendedGrapherUrl(this.grapher.url, [
            this.explorerProgram.switcherRuntime,
            this,
        ])

        if (this.urlBinding) this.urlBinding.unbindFromWindow()
        else this.urlBinding = new UrlBinder()

        this.urlBinding.bindToWindow(url)
        ;(window as any).switcherExplorer = this
    }

    private getGrapher(id: number, currentGrapher?: Grapher) {
        const currentQueryParams = currentGrapher
            ? currentGrapher.url.params
            : strToQueryParams(this.props.queryString || "")

        const grapher = new Grapher(this.chartConfigs.get(id))
        grapher.url.dropUnchangedParams = false
        grapher.hideEntityControls = !this.hideControls && !this.isEmbed
        grapher.populateFromQueryParams(currentQueryParams)
        if (currentGrapher)
            grapher.rootTable.setSelectedEntities(
                currentGrapher.rootTable.selectedEntityNames
            )

        // todo: expand availableentities
        return grapher
    }

    private get panels() {
        return this.explorerProgram.switcherRuntime.groups.map((group) => (
            <ExplorerControlPanel
                key={group.title}
                value={group.value}
                title={group.title}
                explorerSlug={this.explorerProgram.slug}
                name={group.title}
                dropdownOptions={group.dropdownOptions}
                options={group.options}
                isCheckbox={group.isCheckbox}
                onChange={(value) => {
                    this.explorerProgram.switcherRuntime.setValue(
                        group.title,
                        value
                    )
                }}
            />
        ))
    }

    private get header() {
        return (
            <>
                <div></div>
                <div className="ExplorerTitle">
                    {this.explorerProgram.title}
                </div>
                <div
                    className="ExplorerSubtitle"
                    dangerouslySetInnerHTML={{
                        __html: this.explorerProgram.subtitle || "",
                    }}
                ></div>
            </>
        )
    }

    //todo
    private get isEmbed() {
        return false
    }

    render() {
        return (
            <ExplorerShell
                headerElement={this.header}
                controlPanels={this.panels}
                explorerSlug={this.explorerProgram.slug}
                grapher={this.grapher}
                hideControls={this.hideControls}
                isEmbed={this.isEmbed}
            />
        )
    }
}
