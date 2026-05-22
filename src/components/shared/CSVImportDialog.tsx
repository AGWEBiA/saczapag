import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, Table as TableIcon } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface FieldMapping {
  csvHeader: string;
  systemField: string;
}

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fields: { key: string; label: string; required?: boolean; aliases?: string[] }[];
  onImport: (data: any[]) => Promise<{ success: number; errors: string[] }>;
  templateHeaders?: string[];
}

export function CSVImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onImport,
  templateHeaders,
}: CSVImportDialogProps) {
  const [step, setStep] = useState<"upload" | "map" | "importing" | "results">("upload");
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] }>({ success: 0, errors: [] });
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setCsvData([]);
    setHeaders([]);
    setMapping({});
    setImportResults({ success: 0, errors: [] });
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          toast.error("O arquivo está vazio.");
          return;
        }

        const csvHeaders = Object.keys(results.data[0] as object);
        setHeaders(csvHeaders);
        setCsvData(results.data);

        // Auto-mapping
        const initialMapping: Record<string, string> = {};
        fields.forEach((field) => {
          const matchedHeader = csvHeaders.find((h) => {
            const cleanH = h.toLowerCase().trim();
            const cleanField = field.key.toLowerCase();
            const cleanLabel = field.label.toLowerCase();
            const aliases = field.aliases?.map(a => a.toLowerCase()) || [];
            
            return cleanH === cleanField || 
                   cleanH === cleanLabel || 
                   aliases.includes(cleanH) ||
                   cleanH.includes(cleanField) ||
                   cleanField.includes(cleanH);
          });
          if (matchedHeader) {
            initialMapping[field.key] = matchedHeader;
          }
        });

        setMapping(initialMapping);
        setStep("map");
      },
      error: (error) => {
        toast.error("Erro ao processar CSV: " + error.message);
      },
    });
  };

  const startImport = async () => {
    // Validate required fields
    const missingRequired = fields.filter(f => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      toast.error(`Por favor, mapeie os campos obrigatórios: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }

    setStep("importing");
    setLoading(true);

    const formattedData = csvData.map((row) => {
      const item: any = {};
      Object.entries(mapping).forEach(([systemField, csvHeader]) => {
        item[systemField] = row[csvHeader];
      });
      return item;
    });

    try {
      const results = await onImport(formattedData);
      setImportResults(results);
      setStep("results");
    } catch (error: any) {
      toast.error("Erro na importação: " + error.message);
      setStep("map");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    if (!templateHeaders) return;
    const csvContent = templateHeaders.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "template.csv");
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) reset();
      onOpenChange(val);
    }}>
      <DialogContent className={step === "map" || step === "results" ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg border-muted-foreground/25 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">Clique para selecionar ou arraste o arquivo CSV</p>
            <p className="text-xs text-muted-foreground mt-1">Apenas arquivos .csv são suportados</p>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".csv"
              onChange={handleFileUpload}
            />
            {templateHeaders && (
              <Button variant="link" size="sm" className="mt-4 gap-2" onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}>
                <Download className="h-4 w-4" /> Baixar Template
              </Button>
            )}
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TableIcon className="h-4 w-4" />
                Mapeamento de Colunas
              </div>
              <div className="grid grid-cols-2 gap-4 bg-muted/50 p-3 rounded-md font-medium text-xs">
                <div>Campo do Sistema</div>
                <div>Coluna no CSV</div>
              </div>
              <div className="space-y-3">
                {fields.map((field) => (
                  <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Select
                      value={mapping[field.key] || "__ignore__"}
                      onValueChange={(val) => {
                        const next = { ...mapping };
                        if (val === "__ignore__") delete next[field.key];
                        else next[field.key] = val;
                        setMapping(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Ignorar campo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__ignore__">Ignorar campo</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-md mt-6">
              <div className="bg-muted p-2 text-xs font-medium border-b">Prévia dos Dados (primeiras 3 linhas)</div>
              <ScrollArea className="h-[150px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields.map(f => mapping[f.key] && (
                        <TableHead key={f.key} className="text-[10px]">{f.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 3).map((row, i) => (
                      <TableRow key={i}>
                        {fields.map(f => mapping[f.key] && (
                          <TableCell key={f.key} className="text-[10px] truncate max-w-[100px]">
                            {row[mapping[f.key]]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={startImport}>Iniciar Importação</Button>
            </DialogFooter>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="font-medium">Processando importação...</p>
            <p className="text-sm text-muted-foreground text-center">Isso pode levar alguns instantes dependendo da quantidade de registros.</p>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border">
              <div className="flex gap-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{importResults.success}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Sucesso</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-destructive">{importResults.errors.length}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Falhas</div>
                </div>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Detalhes das Falhas
                </div>
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  <ul className="text-xs space-y-1">
                    {importResults.errors.map((err, i) => (
                      <li key={i} className="p-1 border-b last:border-0">{err}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
