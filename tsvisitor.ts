import { LuaVisitor } from './LuaVisitor';
import { ChunkContext, BlockContext, NumberContext, LuaParser, StatContext, IfContext, AssignmentContext, Varlist1Context, Explist1Context, LocalvardeclContext, NamelistContext, VarContext, ExpContext, OperandContext, BinopContext, LocalfunctiondeclContext, FuncbodyContext, Parlist1Context, ForContext, UnopContext, UnopexpContext, FuncnameContext, ArgsContext, NameAndArgsContext, VarSuffixContext, StringContext, LaststatContext, FunctiondeclContext, TableconstructorContext, FieldlistContext, FieldContext, ForinContext, ElseifContext, ElseContext, FunctionContext, VarOrExpContext, PrefixexpContext, FunctioncallContext, DoblockContext, WhileContext } from './LuaParser';

import { ErrorNode } from 'antlr4ts/tree/ErrorNode';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';

import { Console } from 'console';

interface Block {
    currentClass?: string;
}

export interface CompilerError {
    position: number;
    message: string;
}

export class TsVisitor implements LuaVisitor<void> {
    public result: string = "";
    private tabs = 0;
    private blocks: Block[] = [];
    private currentBlock: Block = {};
    private nameMapping: { [key:string]: string} = {};
    public errors: CompilerError[] = [];

    visitBlock(ctx: BlockContext): void {
       this.result += "{";
        if (ctx.childCount > 0) {
            this.result += '\n';
            this.tabs ++;
            for (let i = 0; i < ctx.childCount; i++) {
                ctx.getChild(i).accept(this);
            }
            this.tabs --;
        }
        this.writeTabs();
        this.result += "}";
    }

    visitStat(ctx: StatContext):void{
        this.writeTabs();
        for (let i = 0; i < ctx.childCount; i++) {
            ctx.getChild(i).accept(this);
        }
    }

    visitChunk(ctx: ChunkContext):void {
        this.blocks.push(this.currentBlock);
        this.currentBlock = { };
         for (let i = 0; ; i++) {
            const child = ctx.tryGetChild(i, StatContext);
            if (!child) break;
            const content = child.getChild(0);
            if (content instanceof FunctiondeclContext) {
                const className = this.getClassName(content);
                if (className !== this.currentBlock.currentClass){
                    this.endClass();
                    if (className) this.startClass(className);
                } 
            }
            else if (this.currentBlock.currentClass) {
                this.endClass();
            }
            
            child.accept(this);
            
            const lastChar = this.result[this.result.length - 1];
            if (lastChar === '}' || lastChar === "\n") this.result += "\n";
            else this.result += ";\n";
        }
        const last = ctx.tryGetChild(0, LaststatContext);
        if (last) last.accept(this);
        this.endClass();
        this.currentBlock = this.blocks.pop();
    }

    visitNumber(ctx: NumberContext): void {
        if (ctx.INT()) {
            this.result += ctx.INT().symbol.text;
        }
        else if (ctx.FLOAT()){
            this.result += ctx.FLOAT().symbol.text;
        }
    }

    visitIf(ctx: IfContext): void {
        this.result += "if (";
        ctx.getChild(1).accept(this);
        this.result += ") ";
        ctx.getChild(3).accept(this);
        for (let i = 0; ; i++) {
            const elseif = ctx.tryGetChild(i, ElseifContext);
            if (elseif) {
                elseif.accept(this);
            }
            else break;
        }

        const elseContext = ctx.tryGetChild(0, ElseContext);
        if (elseContext) {
            elseContext.accept(this);
        }
    }

    visitElseif(ctx: ElseifContext): void {
        this.result += ' else if (';
        ctx.getChild(0, ExpContext).accept(this);
        this.result += ') ';
        ctx.getChild(0, BlockContext).accept(this);
    }

    visitElse(ctx: ElseContext): void{
        this.result += ' else ';
        ctx.getChild(0, BlockContext).accept(this);
    }

    visitAssignment(ctx: AssignmentContext): void {
        const vars = ctx.getChild<Varlist1Context>(0, Varlist1Context);
        if (vars.childCount> 1) {
            this.result += "[";
        }
        vars.accept(this);
        if (vars.childCount> 1) {
            this.result += "]";
        }
        this.result += " = ";
        const exps = ctx.getChild<Explist1Context>(0, Explist1Context);
        exps.accept(this);
    }

    visitLocalvardecl(ctx: LocalvardeclContext):void{
        const namelist = ctx.getChild<NamelistContext>(0, NamelistContext);
        const explist1 = ctx.tryGetChild(0, Explist1Context);
        this.result += "let ";
        if (namelist.childCount>  1){
            this.result += "[";
        }
        const needMapping = explist1 && namelist.text == explist1.text && namelist.childCount == 1;
        if (needMapping) {
            this.result += "_";
        }
        namelist.accept(this);
        if (namelist.childCount>  1){
            this.result += "]";
        }

        if (explist1) {
            this.result += " = ";
            explist1.accept(this);
        }

        if (needMapping) this.nameMapping[namelist.text] = "_" + namelist.text;        
    }

    visitExp(ctx: ExpContext) {
        ctx.getChild(0, OperandContext).accept(this);
        for (let i = 0; ; i++) {
            const binop = ctx.tryGetChild(i, BinopContext);
            if (!binop) break;
            const exp = ctx.tryGetChild(i, ExpContext);
            binop.accept(this);
            exp.accept(this);            
        }
    }

    visitPrefixexp(ctx: PrefixexpContext) {
        for (let i = 0; i < ctx.childCount; i++) {
            ctx.getChild(i).accept(this);
        }
    }

    visitVarOrExp(ctx: VarOrExpContext) {
        const v = ctx.tryGetChild(0, VarContext);
        if (v) {
            v.accept(this);
        }
        else {
            this.result += "(";
            ctx.getChild(0, ExpContext).accept(this);
            this.result += ")";
        }
    }

    visitDoblock(ctx: DoblockContext) {
        ctx.getChild(0, BlockContext).accept(this);
    }

    visitWhile(ctx: WhileContext) {
        this.result += "while (";
        ctx.getChild(0, ExpContext).accept(this);
        this.result += ") ";
        ctx.getChild(0, BlockContext).accept(this);
    }

    visitFunctioncall(ctx: FunctioncallContext) {
        for (let i = 0; i < ctx.childCount; i++) {
            ctx.getChild(i).accept(this);
        }
    }

    visitExplist1(ctx: Explist1Context) {
        let needList = ctx.parent instanceof ArgsContext;
        if (ctx.parent instanceof AssignmentContext) {
            const assignement = <AssignmentContext>ctx.parent;
            const vars = assignement.getChild(0, Varlist1Context);
            if (vars.childCount > 1) needList = false;
        }
        const firstChild = ctx.tryGetChild(0, ExpContext);
        let isList = ctx.childCount > 1;
        if (firstChild) {
            const operand = firstChild.tryGetChild(0, OperandContext);
            if (operand && operand.SPREAD()) isList = true;
        }
        if (isList) {
            if (!needList) this.result += '[';
        }

        for (let i = 0; ; i++) {
            const exp = ctx.tryGetChild(i, ExpContext);
            if (!exp) break;
            if (i > 0) this.result += ", ";
            exp.accept(this);    
        }
        if (isList) {
            if (!needList) this.result += ']';
        }
        
    }

    visitTableconstructor(ctx: TableconstructorContext) {
        this.result += '{ ';
        const table = ctx.tryGetChild(0, FieldlistContext);
        table && table.accept(this);
        this.result += ' }';
    }

    visitFieldlist(ctx: FieldlistContext) {
        for (let i = 0; ; i++) {
            const child = ctx.tryGetChild(i, FieldContext);
            if (!child) break;
            if (i > 0) this.result += ', ';

            let key: string;
            if (child.NAME()) {
                const name = child.NAME().text;
                this.result += name;
                this.result += ": ";
                child.getChild(0, ExpContext).accept(this);
            }
            else if (child.childCount == 1) {
                this.result += (i + 1).toString() + ": ";
                child.getChild(0, ExpContext).accept(this);
            }
            else {
                this.result += '[';
                child.getChild(0, ExpContext).accept(this);
                this.result += "]: ";
                child.getChild(1, ExpContext).accept(this);
            }
        }
    }

    visitForin(ctx: ForinContext) {
        this.result += 'for (const [';
        const nameList = ctx.getChild(0, NamelistContext);
        nameList.accept(this);
        this.result += '] of ';
        ctx.getChild(0, Explist1Context).accept(this);
        this.result += ') ';
        ctx.getChild(0, BlockContext).accept(this);
    }
    
    visitLaststat(ctx: LaststatContext) {
        this.writeTabs();
        const explist1 = ctx.tryGetChild(0, Explist1Context);
        if (explist1) {
            this.result += "return ";
            explist1.accept(this);
            this.result += ";\n";
        }
        else {
            this.result += "break;\n";
        }
    }

    visitBinop(ctx: BinopContext) {
        let operator = ctx.text;
        switch (operator) {
            case "~=":
                this.result += " != ";
                break;
            case "and":
                this.result += " && ";
                break;
            case "or":
                this.result += " || ";
                break;
            case "..":
                this.result += " + ";
                break;
            default:
                this.result += ` ${operator} `;
        }
    }

    visitLocalfunctiondecl(ctx: LocalfunctiondeclContext) {
        this.result += `const ${ctx.NAME().text} = function`;
        ctx.getChild<FuncbodyContext>(0, FuncbodyContext).accept(this);
    }

    visitFunction(ctx: FunctionContext) {
        this.result +=  "function ";
        ctx.getChild(0, FuncbodyContext).accept(this);
    }

    visitFunctiondecl(ctx: FunctiondeclContext) {
        const name = ctx.getChild(0, FuncnameContext);
        if (name.NAME().length > 1) {
            this.result += name.NAME(1).text;
        }
        else {
            this.result += 'function ';
            name.accept(this);
        }
        ctx.getChild(0, FuncbodyContext).accept(this);
    }

    private getClassName(ctx: FunctiondeclContext) {
        const name = ctx.getChild(0, FuncnameContext);
        if (name.NAME().length > 1) return name.NAME(0).text;
        return undefined;
    }

    visitFuncbody(ctx: FuncbodyContext) {
        this.result += '(';
        const parlist1 = ctx.tryGetChild(0, Parlist1Context);
        if (parlist1) parlist1.accept(this);
        this.result += ') ';
        ctx.getChild(0, BlockContext).accept(this);
    }
    
    visitVarlist1(ctx: Varlist1Context):void {
        for (let i = 0;; i++) {
            const vars = ctx.tryGetChild(i, VarContext);
            if (!vars) break;
            if (i > 0) this.result += ", ";
            vars.accept(this);
        }
    }

    visitParlist1(ctx: Parlist1Context) {
        const nameList = ctx.tryGetChild<NamelistContext>(0, NamelistContext);
        nameList && nameList.accept(this);
        const spread = ctx.SPREAD();
        if (spread) {
            if (nameList) this.result += ", ";
            this.result += "...__args";
        }
    }

    visitFuncname(ctx: FuncnameContext) {
        this.result += ctx.NAME(0).text;
        if (ctx.NAME().length > 1) {
            this.result += ".";
            this.result += ctx.NAME(1);
        }
    }

    visitNamelist(ctx: NamelistContext) {
        const names = ctx.NAME();
        for (let i = 0; i< names.length; i++){
            if (i != 0) this.result += ", ";
            const name = names[i].text;
            if (this.nameMapping[name]) this.result += "_";
            this.result += name;
        }
    }

    visitFor(ctx: ForContext) {
        const name = ctx.NAME();
        this.result += `for (let ${name} = `;
        ctx.getChild<ExpContext>(0, ExpContext).accept(this);
        const direction = ctx.tryGetChild<ExpContext>(2, ExpContext);
        let step;
        if (direction !== undefined) {
            step = parseInt(direction.text);
        }
        else {
            step = 1;
        }
        this.result += `; ${name}`;
        const end = ctx.getChild<ExpContext>(1, ExpContext);
        if (step > 0) {
            this.result += ` <= `;
        }
        else {
            this.result += " >= ";
        }
        end.accept(this);
        this.result += `; ${name} += ${step}) `;
        ctx.getChild<BlockContext>(0, BlockContext).accept(this);
    }

    visitUnopexp(ctx: UnopexpContext) {
        const operator = ctx.getChild<UnopContext>(0, UnopContext);
        switch (operator.text) {
            case 'not':
                this.result += '!';
                ctx.getChild(0, OperandContext).accept(this);
                break;

            case '-':
                this.result += '-';
                ctx.getChild(0, OperandContext).accept(this);
                break;

            case '#':
                this.result += "lualength(";
                ctx.getChild(0, OperandContext).accept(this);
                this.result += ")";
                break;    

            default:
                this.result += operator.text;
                ctx.getChild(0, OperandContext).accept(this);
                break;
        }
    }

    visitArgs(ctx: ArgsContext) {
        const expList = ctx.tryGetChild(0, Explist1Context);
        if (ctx.childCount > 1) {
            this.result += "(";
            expList && expList.accept(this);
            this.result += ")";
        }
        else{
            ctx.getChild(0).accept(this);
        }
    }

    visitNameAndArgs(ctx: NameAndArgsContext) {
        const name = ctx.NAME();
        if (name) {
            this.result += ".";
            this.result += name;
        }
        ctx.getChild(0, ArgsContext).accept(this);
    }

    visitVarSuffix(ctx: VarSuffixContext) {
        for (let i = 0; ; i++) {
            const child = ctx.tryGetChild(i, NameAndArgsContext);
            if (!child) break;
            child.accept(this);
        }
        const exp = ctx.tryGetChild(0, ExpContext);
        if (exp) {
            this.result += '[';
            exp.accept(this);
            this.result += ']';
        }
        else {
            this.result += '.';
            this.result += ctx.NAME().text;
        }
    }

    visitOperand(ctx: OperandContext) {
        if (ctx.text == 'true') {
            this.result += "true";
        }
        else if (ctx.text == 'false') {
            this.result += "false";
        }
        else if (ctx.text == "nil") {
            this.result += "undefined";
        }
        else if (ctx.SPREAD()) {
            this.result += "...__args";
        }
        else {
            ctx.getChild(0).accept(this);
        }
    }

    // visitExp(ctx: ExpContext):void{
    //     const operand = ctx.getChild<OperandContext>(0, OperandContext);
    //     let i = 0;
    //     while (true) {
    //         const binop = ctx.tryGetChild<BinopContext>(i, BinopContext);
    //         if (!binop) {
    //             break;
    //         }
    //         const exp = ctx.tryGetChild<
    //         i++;
    //     }
    // }

    visitVar(ctx: VarContext): void {
        const exp = ctx.tryGetChild(0, ExpContext);
        if (exp) {
            this.result += "(";
            exp.accept(this);
            this.result += ")";
        }
        else {
            const name = ctx.NAME().text;
            if (name === "self"){
                this.result += "this";
            }
            else {
                if (this.nameMapping[name]) this.result += '_';
                this.result += name;
            }
        }
        for (let i = 0;; i++) {
            const suffix = ctx.tryGetChild(i, VarSuffixContext);
            if (!suffix) break;
            suffix.accept(this);
        }
    }

    visitString(ctx: StringContext) {
        const string = ctx.NORMALSTRING();
        if (string) {
            this.result += string.text;
        }
        else if (ctx.CHARSTRING()) {
            this.result += ctx.CHARSTRING().text;
        }
        else {
            this.result += '`';
            this.result += ctx.LONGSTRING().text;
            this.result += '`';
        }
    }

    visit(tree: ParseTree): void {
    }
    /**
     * Visit the children of a node, and return a user-defined result
     * of the operation.
     *
     * @param node The {@link RuleNode} whose children should be visited.
     * @return The result of visiting the children of the node.
     */
    visitChildren(node: RuleNode):void {
        this.errors.push({ position: node.sourceInterval.a, message: `${(<any>node).__proto__.constructor.name} ${node.text} can't be parsed` });
        for (let i = 0; i < node.childCount; i++) {
            node.getChild(i).accept(this);
        }
    }
    /**
     * Visit a terminal node, and return a user-defined result of the operation.
     *
     * @param node The {@link TerminalNode} to visit.
     * @return The result of visiting the node.
     */
    visitTerminal(node: TerminalNode):void {
        // switch (node.symbol.type) {
        //     case LuaParser.INT:
        //         this.result += node.symbol.text;
        //         break;
        //     case LuaParser.NAME:
        //         this.result += node.symbol.text;
        //         break;
        //     case LuaParser.NORMALSTRING:
        //         this.result += `"${node.symbol.text}"`;
        //         break;
        //     case LuaParser.T__0:
        //         if (node.symbol.text !== ';') console.log(`Unexpected line separator ${node.symbol.text}`);
        //         this.result += ';';
        //         break;
        //     case LuaParser.T__1:
        //         if (node.symbol.text !== '=') console.log(`Unexpected parameter separator ${node.symbol.text}`);
        //         this.result += "=";
        //         break;
        //     case LuaParser.T__3:
        //         if (node.symbol.text !== 'end') console.log(`Unexpected end ${node.symbol.text}`);
        //         this.result += "}";
        //         break;
        //     case LuaParser.T__8:
        //         if (node.symbol.text !== 'then') console.log(`Unexpected end ${node.symbol.text}`);
        //         this.result += "{";
        //         break;
        //     case LuaParser.T__10:
        //         if (node.symbol.text !== 'else') console.log(`Unexpected else ${node.symbol.text}`);
        //         this.result += "else";
        //         break;
        //     case LuaParser.T__12:
        //         if (node.symbol.text !== ',') console.log(`Unexpected parameter separator ${node.symbol.text}`);
        //         this.result += ",";
        //         break;
        //     case LuaParser.T__14:
        //         if (node.symbol.text !== 'function') console.log(`Unexpected function ${node.symbol.text}`);
        //         this.result += "function  ";
        //         break;
        //     case LuaParser.T__15:
        //         this.result += "var ";
        //         break;
        //     case LuaParser.T__16:
        //         if (node.symbol.text !== 'return') console.log(`Unexpected return ${node.symbol.text}`);
        //         this.result += "return ";
        //         break;
        //     case LuaParser.T__17:
        //         if (node.symbol.text !== '[') console.log(`Unexpected [ ${node.symbol.text}`);
        //         this.result += "[";
        //         break;
        //     case LuaParser.T__19:
        //         if (node.symbol.text !== ':') console.log(`Unexpected : ${node.symbol.text}`);
        //         this.result += ".";
        //         break;
        //     case LuaParser.T__24:
        //         if (node.symbol.text !== '(') console.log(`Unexpected ( ${node.symbol.text}`);
        //         this.result += "(";
        //         break;
        //     case LuaParser.T__25:
        //         if (node.symbol.text !== ')') console.log(`Unexpected ) ${node.symbol.text}`);
        //         this.result += ")";
        //         break;
        //     case LuaParser.T__26:
        //         if (node.symbol.text !== 'return') console.log(`Unexpected return ${node.symbol.text}`);
        //         this.result += "return ";
        //         break;
        //     case LuaParser.T__27:
        //         if (node.symbol.text !== ']') console.log(`Unexpected ] ${node.symbol.text}`);
        //         this.result += "]";
        //         break;
        //     case LuaParser.T__30:
        //         if (node.symbol.text !== '+') console.log(`Unexpected + ${node.symbol.text}`);
        //         this.result += "+";
        //         break;
        //     case LuaParser.T__40:
        //         if (node.symbol.text !== '+') console.log(`Unexpected + ${node.symbol.text}`);
        //         this.result += ">=";
        //         break;
        //     case LuaParser.T__43:
        //         if (node.symbol.text !== 'and') console.log(`Unexpected and ${node.symbol.text}`);
        //         this.result += "&&";
        //         break;
        //     default:
        //         this.result += node.symbol.text;
        //         console.log(`Unknown terminal ${node.symbol.type} of text ${node.symbol.text}`);
        // }
        // node.text;
    }
    /**
     * Visit an error node, and return a user-defined result of the operation.
     *
     * @param node The {@link ErrorNode} to visit.
     * @return The result of visiting the node.
     */
    visitErrorNode(node: ErrorNode): void {}

    private startClass(name: string) {
        this.currentBlock.currentClass = name;
        this.result += `class ${this.currentBlock.currentClass} {\n`;
        this.tabs ++;
       // this.writeTabs();
    }

    private endClass() {
        if (!this.currentBlock.currentClass) return;
        this.result += "}\n";
        this.tabs --;
        this.currentBlock.currentClass = undefined;
    }

    private writeTabs() {
        for(let i = 0; i<this.tabs; i++)
        this.result += "    ";
    }
}