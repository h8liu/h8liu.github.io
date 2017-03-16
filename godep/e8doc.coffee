esc = (name) -> name.replace(/\//g, '_').replace(/\./g, '_')
boxof = (name) -> "polygon#" + esc(name)
pathof = (from, to) -> "path#"+esc(from)+"-"+esc(to)

ygrid = 28
boxHeight = 20

main = ->
    redraw(d3.select("svg#canvas"), dag.n, (name) ->
        return
    )
    return

showText = ->
    $("div.texttitle").show()
    $("div.text").show()
    canvas = $("div.canvas")
    canvas.removeClass("canvasfull")
    canvas.addClass("canvastrim")
    return

hideText = ->
    $("div.texttitle").hide()
    $("div.text").hide()
    canvas = $("div.canvas")
    canvas.removeClass("canvastrim")
    canvas.addClass("canvasfull")
    return

reqFile = (pkg, f) ->
    full = pkg + '/<span class="base">' + f + ".go</span>"
    req = $.ajax({
        method: "POST",
        url: "/p/" + pkg + "/" + f + ".go",
    })
    req.done((dat) ->
        $("div.code").html(dat)
        $("span.curfile").html(full)
        showText()
        return
    )
    req.fail((x, status) ->
        alert("failed")
    )
    return

redraw = (svg, dag, onclick) ->
    for name, node of dag
        node.name = name
        node.y = node.y / 2
    createDAG(svg, dag, onclick)
    drawDAG(svg, dag)
    return

$(document).ready(main)

createDAG = (svg, dag, onclick) ->
    svg.selectAll("*").remove() # clear the svg

    paths = []
    for node, dat of dag
        for output in dat.o
            paths.push({n:esc(node)+"-"+esc(output)})

    for path in paths
        p = svg.append("path")
        p.attr("d", "")
        p.attr("id", "BG-"+path.n)
        p.attr("class", "bg")

    for path in paths
        p = svg.append("path")
        p.attr("d", "")
        p.attr("id", path.n)
        p.attr("class", "dep")

    lightIns = (name, first) ->
        if first
            boxin = "box in"
            depin = "dep in"
        else
            boxin = "box in2"
            depin = "dep in2"

        for input in dag[name].i
            svg.select(boxof(input)).attr("class", boxin)
            svg.select(pathof(input, name)).attr("class", depin)
            lightIns(input, false)
        return

    lightOuts = (name, first) ->
        if first
            boxout = "box out"
            depout = "dep out"
        else
            boxout = "box out2"
            depout = "dep out2"

        for output in dag[name].o
            svg.select(boxof(output)).attr("class", boxout)
            svg.select(pathof(name, output)).attr("class", depout)
            lightOuts(output, false)
        return

    hoverFunc = (name) ->
        return (d) ->
            svg.selectAll("polygon").attr("class", "box")
            svg.selectAll("path.dep").attr("class", "dep")
            svg.select(boxof(name)).attr("class", "box focus")
            lightIns(name, true)
            lightOuts(name, true)

            return

    for node, dat of dag
        b = svg.append("polygon")
        b.attr("class", "box")
        b.attr("id", esc(node))

        lab = svg.append("text")
        lab.attr("class", "lab")
        lab.attr("id", "lab-"+esc(node))
        lab.text(node)

        b.on("mouseover", hoverFunc(dat.name))

        lab.on("click", onclick(dat.name))
        b.on("click", onclick(dat.name))

    return

drawDAG = (svg, dag) ->
    xmax = 0
    ymax = 0
    for name, node of dag
        if node.x > xmax
            xmax = node.x
        if node.y > ymax
            ymax = node.y

    nameMaxLen = 0
    for name, node of dag
        n = name.length
        if n > nameMaxLen
            nameMaxLen = n
    boxWidth = nameMaxLen * 6 + 10
    if boxWidth < 50
        boxWidth = 50
    xgrid = boxWidth + 12

    svg.attr("width", (xmax + 1) * xgrid)
    svg.attr("height", (ymax + 1) * ygrid)

    paths = []
    for node, dat of dag
        for output in dat.o
            toNode = dag[output]

            fromx = dat.x * xgrid+boxWidth
            fromy = dat.y * ygrid+boxHeight / 2

            tox = toNode.x * xgrid
            toy = toNode.y * ygrid+boxHeight / 2

            turnx = tox - 6

            path = "M" + fromx + " " + fromy
            path += " L" + turnx + " " + fromy
            path += " L" + turnx + " " + toy
            path += " L" + tox + " " + toy
            paths.push({p:path, n:esc(node)+"-"+esc(output)})

    for path in paths
        p = svg.select("path#BG-"+path.n)
        p.attr("d", path.p)

    for path in paths
        p = svg.select("path#"+path.n)
        p.attr("d", path.p)

    t = 6
    for node, dat of dag
        b = svg.select("polygon#"+esc(node))
        xleft = dat.x * xgrid
        xright = xleft + boxWidth
        ytop = dat.y * ygrid
        ybottom = ytop + boxHeight
        ymid = ytop + boxHeight / 2
        points = ""

        if dat.i.length == 0 and dat.o.length == 0
            points = points + xleft + "," + ytop + " "
            points = points + xleft + "," + ybottom + " "
            points = points + xright + "," + ybottom + " "
            points = points + xright + "," + ytop
        else if dat.i.length == 0
            xright = xright - t / 2
            points = points + xleft + "," + ytop + " "
            points = points + xleft + "," + ybottom + " "
            points = points + xright + "," + ybottom + " "
            points = points + (xright + t) + "," + ymid + " "
            points = points + xright + "," + ytop
        else if dat.o.length == 0
            xleft = xleft + t / 2
            points = points + xleft + "," + ytop + " "
            points = points + (xleft - t) + "," + ymid + " "
            points = points + xleft + "," + ybottom + " "
            points = points + xright + "," + ybottom + " "
            points = points + xright + "," + ytop
        else
            xleft = xleft + t / 2
            xright = xright - t / 2
            points = points + xleft + "," + ytop + " "
            points = points + (xleft - t) + "," + ymid + " "
            points = points + xleft + "," + ybottom + " "
            points = points + xright + "," + ybottom + " "
            points = points + (xright + t) + "," + ymid + " "
            points = points + xright + "," + ytop

        b.attr("points", points)

        lab = svg.select("text#lab-"+esc(node))
        lab.attr("x", dat.x * xgrid + boxWidth / 2)
        lab.attr("y", dat.y * ygrid + boxHeight / 2 + 4)

    return
